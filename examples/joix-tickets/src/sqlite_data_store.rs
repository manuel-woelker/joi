use std::{
    collections::{HashMap, HashSet},
    path::Path,
};

use joi_base::JoiString;
use joi_error::{JoiResult, joi_bail, report};
use rusqlite::{Connection, Transaction, params, params_from_iter, types::Value};

use crate::data_store::{
    AttributeColumn, ColumnDataType, ColumnDescription, DataStore, DataStoreInsertMutation,
    DataStoreMutation, DataStoreMutationResult, DataStoreMutationStep, DataStoreQuery,
    DataStoreQueryResult, QueryCriterion, TableDescription, Values,
};

/// A SQLite-backed [`DataStore`].
pub struct SqliteDataStore {
    connection: Connection,
}

impl SqliteDataStore {
    /// Opens or creates a SQLite database at `path`.
    pub fn open(path: impl AsRef<Path>) -> JoiResult<Self> {
        Connection::open(path)
            .map(Self::from_connection)
            .map_err(report)
    }

    /// Creates an isolated in-memory SQLite database.
    pub fn in_memory() -> JoiResult<Self> {
        Connection::open_in_memory()
            .map(Self::from_connection)
            .map_err(report)
    }

    /// Wraps an existing SQLite connection.
    pub fn from_connection(connection: Connection) -> Self {
        Self { connection }
    }
}

impl DataStore for SqliteDataStore {
    fn ensure_tables(&mut self, tables: Vec<TableDescription>) -> JoiResult<()> {
        let transaction = self.connection.transaction().map_err(report)?;
        for table in tables {
            ensure_table(&transaction, table)?;
        }
        transaction.commit().map_err(report)
    }

    fn query(&self, query: DataStoreQuery) -> JoiResult<DataStoreQueryResult> {
        let table = quote_identifier(&query.table_name.0);
        let (where_clause, criterion_values) = criterion_sql(&query.criterion);
        let where_sql = if where_clause.is_empty() {
            String::new()
        } else {
            format!(" WHERE {where_clause}")
        };
        let count_sql = format!("SELECT COUNT(*) FROM {table}{where_sql}");
        let number_of_hits = self
            .connection
            .query_row(
                &count_sql,
                params_from_iter(criterion_values.iter()),
                |row| row.get::<_, i64>(0),
            )
            .map_err(report)?;
        let number_of_hits = usize::try_from(number_of_hits)
            .map_err(|_| joi_error::joi_error!("SQLite returned a negative row count"))?;

        let schema = table_schema(&self.connection, &query.table_name.0)?;
        let attributes = if query.attributes.len() == 1 && query.attributes[0].0 == "*" {
            schema
                .iter()
                .map(|column| column.description.name.clone())
                .collect()
        } else {
            query.attributes
        };

        if attributes.is_empty() {
            return Ok(DataStoreQueryResult {
                number_of_hits,
                result_columns: attributes
                    .into_iter()
                    .map(|attribute| AttributeColumn {
                        attribute,
                        values: Values::String(Vec::new()),
                    })
                    .collect(),
            });
        }

        let mut result_columns = Vec::with_capacity(attributes.len());
        for attribute in &attributes {
            let Some(data_type) = schema
                .iter()
                .find(|column| column.description.name.0 == attribute.0)
                .map(|column| &column.description.data_type)
            else {
                joi_bail!(
                    "table `{}` has no attribute `{}`",
                    query.table_name.0,
                    attribute.0
                );
            };
            result_columns.push(AttributeColumn {
                attribute: attribute.clone(),
                values: match data_type {
                    ColumnDataType::String => Values::String(Vec::new()),
                    ColumnDataType::Int => Values::Int(Vec::new()),
                },
            });
        }

        let selected_attributes = attributes
            .iter()
            .map(|attribute| quote_identifier(&attribute.0))
            .collect::<Vec<_>>()
            .join(", ");
        let select_sql = format!("SELECT {selected_attributes} FROM {table}{where_sql} LIMIT ?");
        let limit = i64::try_from(query.max_results)
            .map_err(|_| joi_error::joi_error!("query result limit is too large"))?;
        let mut statement = self.connection.prepare(&select_sql).map_err(report)?;
        let mut values = criterion_values;
        values.push(Value::Integer(limit));
        let mut rows = statement.query(params_from_iter(values)).map_err(report)?;
        while let Some(row) = rows.next().map_err(report)? {
            for (index, column) in result_columns.iter_mut().enumerate() {
                match &mut column.values {
                    Values::String(values) => {
                        values.push(row.get::<_, String>(index).map_err(report)?.into());
                    }
                    Values::Int(values) => values.push(row.get(index).map_err(report)?),
                }
            }
        }

        Ok(DataStoreQueryResult {
            number_of_hits,
            result_columns,
        })
    }

    fn mutate(&mut self, mutation: DataStoreMutation) -> JoiResult<DataStoreMutationResult> {
        let transaction = self.connection.transaction().map_err(report)?;
        for step in mutation.steps {
            match step {
                DataStoreMutationStep::Insert(insert) => insert_rows(&transaction, insert)?,
            }
        }
        transaction.commit().map_err(report)?;
        Ok(DataStoreMutationResult {})
    }
}

fn criterion_sql(criterion: &QueryCriterion) -> (String, Vec<Value>) {
    match criterion {
        QueryCriterion::MatchAny => ("1 = 1".into(), Vec::new()),
        QueryCriterion::Not(criterion) => {
            let (sql, values) = criterion_sql(criterion);
            (format!("NOT ({sql})"), values)
        }
        QueryCriterion::Equals { attribute, values } => {
            if values.is_empty() {
                return ("1 = 0".into(), Vec::new());
            }
            let placeholders = std::iter::repeat_n("?", values.len())
                .collect::<Vec<_>>()
                .join(", ");
            (
                format!("{} IN ({placeholders})", quote_identifier(&attribute.0)),
                values
                    .iter()
                    .cloned()
                    .map(|value| Value::Text(value.into()))
                    .collect(),
            )
        }
    }
}

fn ensure_table(transaction: &Transaction<'_>, table: TableDescription) -> JoiResult<()> {
    if table.columns.is_empty() {
        joi_bail!("table `{}` must define at least one column", table.name.0);
    }
    let mut requested_names = HashSet::new();
    for column in &table.columns {
        if !requested_names.insert(&column.name.0) {
            joi_bail!("table `{}` defines duplicate columns", table.name.0);
        }
    }
    drop(requested_names);

    let exists = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?1)",
            params![table.name.0.as_str()],
            |row| row.get::<_, bool>(0),
        )
        .map_err(report)?;
    let table_name = quote_identifier(&table.name.0);
    if !exists {
        let columns = table
            .columns
            .iter()
            .enumerate()
            .map(|(index, column)| column_definition(column, index == 0))
            .collect::<Vec<_>>()
            .join(", ");
        transaction
            .execute(&format!("CREATE TABLE {table_name} ({columns})"), [])
            .map_err(report)?;
        return Ok(());
    }

    let existing = table_schema(transaction, &table.name.0)?
        .into_iter()
        .map(|column| (column.description.name.0.clone(), column))
        .collect::<HashMap<_, _>>();
    for (index, column) in table.columns.into_iter().enumerate() {
        if let Some(existing_column) = existing.get(&column.name.0) {
            if existing_column.description.data_type != column.data_type {
                joi_bail!(
                    "attribute `{}` has a different type in table `{}`",
                    column.name.0,
                    table.name.0
                );
            }
            if index == 0 && !existing_column.primary_key {
                joi_bail!(
                    "first attribute `{}` is not the primary key of table `{}`",
                    column.name.0,
                    table.name.0
                );
            }
            continue;
        }
        if index == 0 {
            joi_bail!(
                "cannot add missing primary-key attribute `{}` to existing table `{}`",
                column.name.0,
                table.name.0
            );
        }
        transaction
            .execute(
                &format!(
                    "ALTER TABLE {table_name} ADD COLUMN {}",
                    column_definition(&column, false)
                ),
                [],
            )
            .map_err(report)?;
    }
    Ok(())
}

fn insert_rows(transaction: &Transaction<'_>, insert: DataStoreInsertMutation) -> JoiResult<()> {
    let Some(first_column) = insert.columns.first() else {
        joi_bail!(
            "insert into `{}` must include at least one column",
            insert.table_name.0
        );
    };
    let row_count = value_count(&first_column.values);
    let schema = table_schema(transaction, &insert.table_name.0)?
        .into_iter()
        .map(|column| {
            (
                column.description.name.0.clone(),
                column.description.data_type,
            )
        })
        .collect::<HashMap<_, _>>();
    let mut names = HashSet::new();
    for column in &insert.columns {
        if !names.insert(&column.attribute.0) {
            joi_bail!(
                "insert contains duplicate attribute `{}`",
                column.attribute.0
            );
        }
        if value_count(&column.values) != row_count {
            joi_bail!("all inserted columns must contain the same number of values");
        }
        let Some(data_type) = schema.get(&column.attribute.0) else {
            joi_bail!(
                "table `{}` has no attribute `{}`",
                insert.table_name.0,
                column.attribute.0
            );
        };
        if *data_type != value_data_type(&column.values) {
            joi_bail!(
                "values for attribute `{}` do not match its declared type",
                column.attribute.0
            );
        }
    }
    if row_count == 0 {
        return Ok(());
    }

    let table = quote_identifier(&insert.table_name.0);
    let columns = insert
        .columns
        .iter()
        .map(|column| quote_identifier(&column.attribute.0))
        .collect::<Vec<_>>()
        .join(", ");
    let placeholders = (1..=insert.columns.len())
        .map(|index| format!("?{index}"))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!("INSERT INTO {table} ({columns}) VALUES ({placeholders})");
    let mut statement = transaction.prepare(&sql).map_err(report)?;
    for row_index in 0..row_count {
        let values = insert
            .columns
            .iter()
            .map(|column| value_at(&column.values, row_index))
            .collect::<Vec<_>>();
        statement
            .execute(params_from_iter(values.iter()))
            .map_err(report)?;
    }
    Ok(())
}

struct SqliteColumn {
    description: ColumnDescription,
    primary_key: bool,
}

fn table_schema(connection: &Connection, table_name: &str) -> JoiResult<Vec<SqliteColumn>> {
    let sql = format!("PRAGMA table_info({})", quote_identifier(table_name));
    let mut statement = connection.prepare(&sql).map_err(report)?;
    let columns = statement
        .query_map([], |row| {
            let name = row.get::<_, String>(1)?;
            let sqlite_type = row.get::<_, String>(2)?;
            let primary_key = row.get::<_, bool>(5)?;
            Ok((name, sqlite_type, primary_key))
        })
        .map_err(report)?;

    let mut schema = Vec::new();
    for column in columns {
        let (name, sqlite_type, primary_key) = column.map_err(report)?;
        let data_type = match sqlite_type.as_str() {
            "TEXT" => ColumnDataType::String,
            "INTEGER" => ColumnDataType::Int,
            unsupported => {
                joi_bail!("attribute `{name}` uses unsupported SQLite type `{unsupported}`")
            }
        };
        schema.push(SqliteColumn {
            description: ColumnDescription {
                name: crate::data_store::AttributeName(name.into()),
                description: JoiString::new(),
                data_type,
            },
            primary_key,
        });
    }
    Ok(schema)
}

fn column_definition(column: &ColumnDescription, primary_key: bool) -> String {
    let name = quote_identifier(&column.name.0);
    let data_type = match column.data_type {
        ColumnDataType::String => "TEXT",
        ColumnDataType::Int => "INTEGER",
    };
    let primary_key = if primary_key { " PRIMARY KEY" } else { "" };
    format!("{name} {data_type} NOT NULL{primary_key}")
}

fn quote_identifier(identifier: &str) -> String {
    format!("\"{}\"", identifier.replace('"', "\"\""))
}

fn value_count(values: &Values) -> usize {
    match values {
        Values::String(values) => values.len(),
        Values::Int(values) => values.len(),
    }
}

fn value_data_type(values: &Values) -> ColumnDataType {
    match values {
        Values::String(_) => ColumnDataType::String,
        Values::Int(_) => ColumnDataType::Int,
    }
}

fn value_at(values: &Values, index: usize) -> Value {
    match values {
        Values::String(values) => Value::Text(values[index].to_string()),
        Values::Int(values) => Value::Integer(values[index]),
    }
}

#[cfg(test)]
mod tests {
    use joi_base::JoiString;

    use crate::data_store::{
        AttributeColumn, AttributeName, ColumnDataType, ColumnDescription, DataStore,
        DataStoreInsertMutation, DataStoreMutation, DataStoreMutationStep, DataStoreQuery,
        QueryCriterion, TableDescription, TableName, Values,
    };

    use super::SqliteDataStore;

    #[test]
    fn creates_inserts_and_queries_typed_columns() {
        let mut store = SqliteDataStore::in_memory().unwrap();
        store.ensure_tables(vec![ticket_table()]).unwrap();
        store
            .mutate(DataStoreMutation {
                steps: vec![insert_tickets(&[("T-1", 2), ("T-2", 5)])],
            })
            .unwrap();

        let result = store
            .query(DataStoreQuery {
                table_name: table("tickets"),
                criterion: QueryCriterion::MatchAny,
                max_results: 1,
                attributes: vec![attribute("id"), attribute("priority")],
            })
            .unwrap();

        assert_eq!(result.number_of_hits, 2);
        assert_eq!(result.result_columns.len(), 2);
        assert!(matches!(
            &result.result_columns[0].values,
            Values::String(values) if values == &[JoiString::from("T-1")]
        ));
        assert!(matches!(
            &result.result_columns[1].values,
            Values::Int(values) if values == &[2]
        ));

        let all = store
            .query(DataStoreQuery {
                table_name: table("tickets"),
                criterion: QueryCriterion::MatchAny,
                max_results: 1,
                attributes: vec![attribute("*")],
            })
            .unwrap();
        assert_eq!(
            all.result_columns
                .iter()
                .map(|column| column.attribute.0.as_str())
                .collect::<Vec<_>>(),
            ["id", "priority"]
        );

        let matching = store
            .query(DataStoreQuery {
                table_name: table("tickets"),
                criterion: QueryCriterion::Equals {
                    attribute: attribute("priority"),
                    values: vec!["2".into(), "5".into()],
                },
                max_results: 10,
                attributes: vec![attribute("id")],
            })
            .unwrap();
        assert_eq!(matching.number_of_hits, 2);

        let excluded = store
            .query(DataStoreQuery {
                table_name: table("tickets"),
                criterion: QueryCriterion::Not(Box::new(QueryCriterion::Equals {
                    attribute: attribute("priority"),
                    values: vec!["2".into()],
                })),
                max_results: 10,
                attributes: vec![attribute("id")],
            })
            .unwrap();
        assert_eq!(excluded.number_of_hits, 1);
    }

    #[test]
    fn adds_missing_columns_to_existing_tables() {
        let mut store = SqliteDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![TableDescription {
                name: table("tickets"),
                columns: vec![string_column("id")],
            }])
            .unwrap();

        store.ensure_tables(vec![ticket_table()]).unwrap();

        let result = store
            .query(DataStoreQuery {
                table_name: table("tickets"),
                criterion: QueryCriterion::MatchAny,
                max_results: 0,
                attributes: vec![attribute("priority")],
            })
            .unwrap();
        assert!(
            matches!(&result.result_columns[0].values, Values::Int(values) if values.is_empty())
        );
    }

    #[test]
    fn rolls_back_all_mutation_steps_when_one_fails() {
        let mut store = SqliteDataStore::in_memory().unwrap();
        store.ensure_tables(vec![ticket_table()]).unwrap();

        let error = store
            .mutate(DataStoreMutation {
                steps: vec![insert_tickets(&[("T-1", 1)]), insert_tickets(&[("T-1", 2)])],
            })
            .err()
            .expect("duplicate primary key should fail");

        assert!(error.to_string().contains("UNIQUE constraint failed"));
        let result = store
            .query(DataStoreQuery {
                table_name: table("tickets"),
                criterion: QueryCriterion::MatchAny,
                max_results: 10,
                attributes: vec![attribute("id")],
            })
            .unwrap();
        assert_eq!(result.number_of_hits, 0);
    }

    fn ticket_table() -> TableDescription {
        TableDescription {
            name: table("tickets"),
            columns: vec![
                string_column("id"),
                ColumnDescription {
                    name: attribute("priority"),
                    description: "Ticket priority".into(),
                    data_type: ColumnDataType::Int,
                },
            ],
        }
    }

    fn string_column(name: &str) -> ColumnDescription {
        ColumnDescription {
            name: attribute(name),
            description: JoiString::new(),
            data_type: ColumnDataType::String,
        }
    }

    fn insert_tickets(rows: &[(&str, i64)]) -> DataStoreMutationStep {
        DataStoreMutationStep::Insert(DataStoreInsertMutation {
            table_name: table("tickets"),
            columns: vec![
                AttributeColumn {
                    attribute: attribute("id"),
                    values: Values::String(
                        rows.iter().map(|(id, _)| JoiString::from(*id)).collect(),
                    ),
                },
                AttributeColumn {
                    attribute: attribute("priority"),
                    values: Values::Int(rows.iter().map(|(_, priority)| *priority).collect()),
                },
            ],
        })
    }

    fn table(name: &str) -> TableName {
        TableName(name.into())
    }

    fn attribute(name: &str) -> AttributeName {
        AttributeName(name.into())
    }
}
