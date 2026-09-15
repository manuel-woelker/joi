use joi_base::JoiString;
use joi_error::{JoiResult, joi_error};
use serde::{Deserialize, Serialize};

use crate::command::Command;
use crate::command_handler::CommandHandler;
use crate::data_store::{
    AttributeName, DataStoreQuery, QueryCriterion, QuerySort, QuerySortDirection, SharedDataStore,
    TableName, Values,
};

/// Executes generic table queries against a shared data store.
pub struct QueryCommand {
    data_store: SharedDataStore,
}

impl QueryCommand {
    /// Creates a query command using the shared data store.
    pub fn new(data_store: SharedDataStore) -> Self {
        Self { data_store }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
/// JSON-facing description of a generic table query.
pub struct QueryRequest {
    table_name: JoiString,
    criterion: QueryRequestCriterion,
    sorting: Vec<QueryRequestSort>,
    max_results: usize,
    attributes: Vec<JoiString>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct QueryRequestSort {
    attribute: JoiString,
    direction: QueryRequestSortDirection,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum QueryRequestSortDirection {
    Ascending,
    Descending,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum QueryRequestCriterion {
    MatchAny,
    All(Vec<QueryRequestCriterion>),
    One(Vec<QueryRequestCriterion>),
    None(Vec<QueryRequestCriterion>),
    Not(Box<QueryRequestCriterion>),
    Equals {
        attribute: JoiString,
        values: Vec<JoiString>,
    },
    LessThan {
        attribute: JoiString,
        value: JoiString,
    },
    Set {
        attribute: JoiString,
    },
    Unset {
        attribute: JoiString,
    },
    InRange {
        attribute: JoiString,
        minimum: Option<JoiString>,
        maximum: Option<JoiString>,
    },
    Contains {
        attribute: JoiString,
        value: JoiString,
    },
}

impl Command for QueryRequest {
    const NAME: &'static str = "query";
    const DESCRIPTION: &'static str = "Query records from a registered data table.";
    type Response = QueryResponse;
}

#[derive(Debug, PartialEq, Serialize)]
/// Columnar result returned by the `query` command.
pub struct QueryResponse {
    number_of_hits: usize,
    result_columns: Vec<QueryResultColumn>,
}

#[derive(Debug, PartialEq, Serialize)]
/// Values returned for one requested attribute.
pub struct QueryResultColumn {
    attribute: JoiString,
    values: QueryValues,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "type", content = "values", rename_all = "snake_case")]
/// A homogeneous sequence of query result values.
pub enum QueryValues {
    /// String values.
    String(Vec<JoiString>),
    /// Signed integer values.
    Int(Vec<i64>),
}

impl CommandHandler for QueryCommand {
    type Command = QueryRequest;

    fn execute(
        &self,
        _context: &crate::command_handler::CommandContext,
        request: Self::Command,
    ) -> JoiResult<QueryResponse> {
        let query = DataStoreQuery {
            table_name: TableName(request.table_name),
            criterion: query_criterion(request.criterion),
            sorting: request
                .sorting
                .into_iter()
                .map(|sort| QuerySort {
                    attribute: AttributeName(sort.attribute),
                    direction: match sort.direction {
                        QueryRequestSortDirection::Ascending => QuerySortDirection::Ascending,
                        QueryRequestSortDirection::Descending => QuerySortDirection::Descending,
                    },
                })
                .collect(),
            max_results: request.max_results,
            attributes: request.attributes.into_iter().map(AttributeName).collect(),
        };
        let result = self
            .data_store
            .lock()
            .map_err(|_| joi_error!("data store lock is poisoned"))?
            .query(query)?;

        Ok(QueryResponse {
            number_of_hits: result.number_of_hits,
            result_columns: result
                .result_columns
                .into_iter()
                .map(|column| QueryResultColumn {
                    attribute: column.attribute.0,
                    values: match column.values {
                        Values::String(values) => QueryValues::String(values),
                        Values::NullableString(_) => {
                            unreachable!("queries never return mutation-only values")
                        }
                        Values::Int(values) => QueryValues::Int(values),
                    },
                })
                .collect(),
        })
    }
}

fn query_criterion(criterion: QueryRequestCriterion) -> QueryCriterion {
    match criterion {
        QueryRequestCriterion::MatchAny => QueryCriterion::MatchAny,
        QueryRequestCriterion::All(criteria) => {
            QueryCriterion::All(criteria.into_iter().map(query_criterion).collect())
        }
        QueryRequestCriterion::One(criteria) => {
            QueryCriterion::One(criteria.into_iter().map(query_criterion).collect())
        }
        QueryRequestCriterion::None(criteria) => {
            QueryCriterion::None(criteria.into_iter().map(query_criterion).collect())
        }
        QueryRequestCriterion::Not(criterion) => {
            QueryCriterion::Not(Box::new(query_criterion(*criterion)))
        }
        QueryRequestCriterion::Equals { attribute, values } => QueryCriterion::Equals {
            attribute: AttributeName(attribute),
            values,
        },
        QueryRequestCriterion::LessThan { attribute, value } => QueryCriterion::LessThan {
            attribute: AttributeName(attribute),
            value,
        },
        QueryRequestCriterion::Set { attribute } => QueryCriterion::Set(AttributeName(attribute)),
        QueryRequestCriterion::Unset { attribute } => {
            QueryCriterion::Unset(AttributeName(attribute))
        }
        QueryRequestCriterion::InRange {
            attribute,
            minimum,
            maximum,
        } => QueryCriterion::InRange {
            attribute: AttributeName(attribute),
            minimum,
            maximum,
        },
        QueryRequestCriterion::Contains { attribute, value } => QueryCriterion::Contains {
            attribute: AttributeName(attribute),
            value,
        },
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use joi_base::JoiString;

    use crate::command_handler::CommandHandler;
    use crate::data_store::{DataStore, TableDescriptionProvider, TestDataProvider};
    use crate::sqlite_data_store::SqliteDataStore;
    use crate::user_session_command::{UserTableDescriptionProvider, UserTestDataProvider};

    use super::{
        QueryCommand, QueryRequest, QueryRequestCriterion, QueryRequestSort,
        QueryRequestSortDirection, QueryValues,
    };

    #[test]
    fn queries_columns() {
        let mut store = SqliteDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![UserTableDescriptionProvider.table_description()])
            .unwrap();
        UserTestDataProvider.insert_test_data(&mut store).unwrap();
        let command = QueryCommand::new(Arc::new(Mutex::new(Box::new(store))));

        let response = command
            .execute(
                &Default::default(),
                QueryRequest {
                    table_name: "users".into(),
                    criterion: QueryRequestCriterion::MatchAny,
                    sorting: vec![QueryRequestSort {
                        attribute: "username".into(),
                        direction: QueryRequestSortDirection::Descending,
                    }],
                    max_results: 2,
                    attributes: vec!["username".into(), "name".into()],
                },
            )
            .unwrap();

        assert_eq!(response.number_of_hits, 2);
        assert_eq!(response.result_columns.len(), 2);
        assert!(matches!(
            &response.result_columns[0].values,
            QueryValues::String(values) if values.len() == 2 && values[0] == "joe.tester"
        ));
    }

    #[test]
    fn executes_composed_criteria() {
        let mut store = SqliteDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![UserTableDescriptionProvider.table_description()])
            .unwrap();
        UserTestDataProvider.insert_test_data(&mut store).unwrap();
        let command = QueryCommand::new(Arc::new(Mutex::new(Box::new(store))));

        let response = command
            .execute(
                &Default::default(),
                QueryRequest {
                    table_name: "users".into(),
                    criterion: QueryRequestCriterion::All(vec![
                        QueryRequestCriterion::One(vec![
                            QueryRequestCriterion::Contains {
                                attribute: "name".into(),
                                value: "developer".into(),
                            },
                            QueryRequestCriterion::Equals {
                                attribute: "username".into(),
                                values: vec!["missing".into()],
                            },
                        ]),
                        QueryRequestCriterion::None(vec![QueryRequestCriterion::Equals {
                            attribute: "username".into(),
                            values: vec!["joe.tester".into()],
                        }]),
                        QueryRequestCriterion::Set {
                            attribute: "name".into(),
                        },
                    ]),
                    sorting: Vec::new(),
                    max_results: 10,
                    attributes: vec!["username".into()],
                },
            )
            .unwrap();

        assert_eq!(response.number_of_hits, 1);
        assert!(matches!(
            &response.result_columns[0].values,
            QueryValues::String(values) if values == &[JoiString::from("jane.developer")]
        ));
    }
}
