use crate::data_store::{
    AttributeColumn, AttributeName, ColumnDataType, ColumnDescription, DataStore,
    DataStoreInsertMutation, DataStoreMutation, DataStoreMutationStep, DataStoreQuery,
    QueryCriterion, TableDescription, TableDescriptionProvider, TableName, TestDataProvider,
    Values,
};
use crate::module::{Module, ModuleInfo};

/// Contributes the table used to persist tickets.
pub struct TicketTableDescriptionProvider;

impl TableDescriptionProvider for TicketTableDescriptionProvider {
    fn table_description(&self) -> TableDescription {
        TableDescription {
            name: TableName("tickets".into()),
            columns: vec![
                ticket_column("id", "Immutable KSUID ticket identifier"),
                ticket_column("key", "Human-readable ticket key in PROJECT-NUMBER form"),
                ticket_column("title", "Short summary of the ticket"),
                ticket_column("description", "Detailed ticket description"),
                ticket_column("status", "Current workflow status"),
            ],
        }
    }
}

fn ticket_column(name: &'static str, description: &'static str) -> ColumnDescription {
    ColumnDescription {
        name: AttributeName(name.into()),
        description: description.into(),
        data_type: ColumnDataType::String,
    }
}

/// Contributes the table used to persist users.
pub struct UserTableDescriptionProvider;

impl TableDescriptionProvider for UserTableDescriptionProvider {
    fn table_description(&self) -> TableDescription {
        TableDescription {
            name: TableName("users".into()),
            columns: vec![
                user_column("id", "Immutable KSUID user identifier"),
                user_column("username", "Unique user login name"),
                user_column("name", "User display name"),
            ],
        }
    }
}

fn user_column(name: &'static str, description: &'static str) -> ColumnDescription {
    ColumnDescription {
        name: AttributeName(name.into()),
        description: description.into(),
        data_type: ColumnDataType::String,
    }
}

/// Inserts representative users for local development.
pub struct UserTestDataProvider;

impl TestDataProvider for UserTestDataProvider {
    fn insert_test_data(&self, data_store: &mut dyn DataStore) -> joi_error::JoiResult<()> {
        let existing = data_store.query(DataStoreQuery {
            table_name: TableName("users".into()),
            criterion: QueryCriterion::MatchAny,
            max_results: 0,
            attributes: Vec::new(),
        })?;
        if existing.number_of_hits > 0 {
            return Ok(());
        }

        data_store.mutate(DataStoreMutation {
            steps: vec![DataStoreMutationStep::Insert(DataStoreInsertMutation {
                table_name: TableName("users".into()),
                columns: vec![
                    test_data_column(
                        "id",
                        [
                            ksuid::Ksuid::generate().to_base62(),
                            ksuid::Ksuid::generate().to_base62(),
                        ],
                    ),
                    test_data_column("username", ["jane.developer", "joe.tester"]),
                    test_data_column("name", ["Jane Developer", "Joe Tester"]),
                ],
            })],
        })?;
        Ok(())
    }
}

/// Inserts representative tickets for local development.
pub struct TicketTestDataProvider;

impl TestDataProvider for TicketTestDataProvider {
    fn insert_test_data(&self, data_store: &mut dyn DataStore) -> joi_error::JoiResult<()> {
        let existing = data_store.query(DataStoreQuery {
            table_name: TableName("tickets".into()),
            criterion: QueryCriterion::MatchAny,
            max_results: 0,
            attributes: Vec::new(),
        })?;
        if existing.number_of_hits > 0 {
            return Ok(());
        }

        data_store.mutate(DataStoreMutation {
            steps: vec![DataStoreMutationStep::Insert(DataStoreInsertMutation {
                table_name: TableName("tickets".into()),
                columns: vec![
                    test_data_column(
                        "id",
                        [
                            ksuid::Ksuid::generate().to_base62(),
                            ksuid::Ksuid::generate().to_base62(),
                            ksuid::Ksuid::generate().to_base62(),
                        ],
                    ),
                    test_data_column("key", ["TEST-1", "TEST-2", "TEST-3"]),
                    test_data_column(
                        "title",
                        [
                            "Fix navigation bug",
                            "Add issue filters",
                            "Review table schema",
                        ],
                    ),
                    test_data_column(
                        "description",
                        [
                            "Navigation loses the selected view after reload",
                            "Allow views to filter issues by workflow status",
                            "Check the initial ticket storage definition",
                        ],
                    ),
                    test_data_column("status", ["open", "in-progress", "closed"]),
                ],
            })],
        })?;
        Ok(())
    }
}

fn test_data_column<T: Into<joi_base::JoiString>, const N: usize>(
    name: &'static str,
    values: [T; N],
) -> AttributeColumn {
    AttributeColumn {
        attribute: AttributeName(name.into()),
        values: Values::String(values.into_iter().map(Into::into).collect()),
    }
}

#[derive(Default)]
pub struct TicketsModule {}

impl Module for TicketsModule {
    fn info(&self) -> ModuleInfo {
        ModuleInfo {
            name: "tickets".into(),
            description: "Basic ticket module".into(),
            version: env!("CARGO_PKG_VERSION").into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::data_store::{
        AttributeName, ColumnDataType, DataStore, DataStoreQuery, QueryCriterion,
        TableDescriptionProvider, TestDataProvider, Values,
    };
    use crate::sqlite_data_store::SqliteDataStore;

    use super::{
        TicketTableDescriptionProvider, TicketTestDataProvider, UserTableDescriptionProvider,
        UserTestDataProvider,
    };

    #[test]
    fn describes_the_ticket_table() {
        let table = TicketTableDescriptionProvider.table_description();

        assert_eq!(table.name.0, "tickets");
        assert_eq!(
            table
                .columns
                .iter()
                .map(|column| column.name.0.as_str())
                .collect::<Vec<_>>(),
            ["id", "key", "title", "description", "status"]
        );
        assert!(
            table
                .columns
                .iter()
                .all(|column| column.data_type == ColumnDataType::String)
        );
    }

    #[test]
    fn inserts_test_tickets() {
        let mut store = SqliteDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![TicketTableDescriptionProvider.table_description()])
            .unwrap();

        TicketTestDataProvider.insert_test_data(&mut store).unwrap();

        let result = store
            .query(DataStoreQuery {
                table_name: crate::data_store::TableName("tickets".into()),
                criterion: QueryCriterion::MatchAny,
                max_results: 10,
                attributes: vec![
                    AttributeName("id".into()),
                    AttributeName("key".into()),
                    AttributeName("status".into()),
                ],
            })
            .unwrap();
        assert_eq!(result.number_of_hits, 3);
        assert!(matches!(
            &result.result_columns[0].values,
            Values::String(values) if values.iter().map(|value| value.as_str()).collect::<Vec<_>>().iter()
                .all(|value| ksuid::Ksuid::from_base62(value).is_ok())
        ));
        assert!(matches!(
            &result.result_columns[1].values,
            Values::String(values) if values.iter().map(|value| value.as_str()).collect::<Vec<_>>()
                == ["TEST-1", "TEST-2", "TEST-3"]
        ));

        TicketTestDataProvider.insert_test_data(&mut store).unwrap();
        assert_eq!(
            store
                .query(DataStoreQuery {
                    table_name: crate::data_store::TableName("tickets".into()),
                    criterion: QueryCriterion::MatchAny,
                    max_results: 0,
                    attributes: Vec::new(),
                })
                .unwrap()
                .number_of_hits,
            3
        );
    }

    #[test]
    fn describes_the_user_table() {
        let table = UserTableDescriptionProvider.table_description();

        assert_eq!(table.name.0, "users");
        assert_eq!(
            table
                .columns
                .iter()
                .map(|column| column.name.0.as_str())
                .collect::<Vec<_>>(),
            ["id", "username", "name"]
        );
        assert!(
            table
                .columns
                .iter()
                .all(|column| column.data_type == ColumnDataType::String)
        );
    }

    #[test]
    fn inserts_test_users() {
        let mut store = SqliteDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![UserTableDescriptionProvider.table_description()])
            .unwrap();

        UserTestDataProvider.insert_test_data(&mut store).unwrap();

        let result = store
            .query(DataStoreQuery {
                table_name: crate::data_store::TableName("users".into()),
                criterion: QueryCriterion::MatchAny,
                max_results: 10,
                attributes: vec![
                    AttributeName("username".into()),
                    AttributeName("name".into()),
                ],
            })
            .unwrap();
        assert_eq!(result.number_of_hits, 2);
        assert!(matches!(
            &result.result_columns[0].values,
            Values::String(values) if values.iter().map(|value| value.as_str()).collect::<Vec<_>>()
                == ["jane.developer", "joe.tester"]
        ));
        assert!(matches!(
            &result.result_columns[1].values,
            Values::String(values) if values.iter().map(|value| value.as_str()).collect::<Vec<_>>()
                == ["Jane Developer", "Joe Tester"]
        ));

        UserTestDataProvider.insert_test_data(&mut store).unwrap();
        assert_eq!(
            store
                .query(DataStoreQuery {
                    table_name: crate::data_store::TableName("users".into()),
                    criterion: QueryCriterion::MatchAny,
                    max_results: 0,
                    attributes: Vec::new(),
                })
                .unwrap()
                .number_of_hits,
            2
        );
    }
}
