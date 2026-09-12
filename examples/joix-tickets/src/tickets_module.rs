use std::collections::HashMap;

use joi_base::JoiString;
use joi_server::data_store::{
    AttributeColumn, AttributeName, ColumnDataType, ColumnDescription, ColumnReference, DataStore,
    DataStoreInsertMutation, DataStoreMutation, DataStoreMutationStep, DataStoreQuery,
    QueryCriterion, TableDescription, TableDescriptionProvider, TableName, TestDataProvider,
    Values,
};

/// Contributes the table used to persist tickets.
pub struct TicketTableDescriptionProvider;

impl TableDescriptionProvider for TicketTableDescriptionProvider {
    fn table_description(&self) -> TableDescription {
        TableDescription {
            name: TableName("tickets".into()),
            discoverable: true,
            columns: vec![
                ticket_column("id", "Immutable KSUID ticket identifier"),
                ticket_column("key", "Human-readable ticket key in PROJECT-NUMBER form"),
                ColumnDescription {
                    name: AttributeName("project_id".into()),
                    description: "Project containing the ticket".into(),
                    data_type: ColumnDataType::String,
                    // Existing development databases can add nullable columns in place.
                    optional: true,
                    references: Some(ColumnReference {
                        table: TableName("projects".into()),
                        attribute: AttributeName("id".into()),
                    }),
                },
                ticket_column("title", "Short summary of the ticket"),
                ticket_column("description", "Detailed ticket description"),
                ticket_column("status", "Current workflow status"),
                ColumnDescription {
                    name: AttributeName("assignee".into()),
                    description: "User assigned to the ticket".into(),
                    data_type: ColumnDataType::String,
                    optional: true,
                    references: Some(ColumnReference {
                        table: TableName("users".into()),
                        attribute: AttributeName("id".into()),
                    }),
                },
            ],
        }
    }
}

fn ticket_column(name: &'static str, description: &'static str) -> ColumnDescription {
    ColumnDescription {
        name: AttributeName(name.into()),
        description: description.into(),
        data_type: ColumnDataType::String,
        optional: false,
        references: None,
    }
}

/// Inserts representative tickets for local development.
pub struct TicketTestDataProvider;

impl TestDataProvider for TicketTestDataProvider {
    fn insert_test_data(&self, data_store: &mut dyn DataStore) -> joi_error::JoiResult<()> {
        let projects = project_ids_by_prefix(data_store)?;
        let users = data_store.query(DataStoreQuery {
            table_name: TableName("users".into()),
            criterion: QueryCriterion::MatchAny,
            max_results: 2,
            attributes: vec![AttributeName("id".into())],
        })?;
        let Values::String(user_ids) = &users.result_columns[0].values else {
            return Err(joi_error::joi_error!("user IDs must be strings"));
        };
        if user_ids.is_empty() {
            return Err(joi_error::joi_error!(
                "ticket test data requires at least one user"
            ));
        }
        let existing = data_store.query(DataStoreQuery {
            table_name: TableName("tickets".into()),
            criterion: QueryCriterion::MatchAny,
            max_results: 0,
            attributes: Vec::new(),
        })?;
        if existing.number_of_hits > 0 {
            return associate_existing_tickets(data_store, &projects);
        }

        let keys = ["TEST-1", "TEST-2", "DEMO-1"];
        let project_ids = keys
            .iter()
            .map(|key| project_for_key(&projects, key))
            .collect::<joi_error::JoiResult<Vec<_>>>()?;

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
                    test_data_column("key", keys),
                    AttributeColumn {
                        attribute: AttributeName("project_id".into()),
                        values: Values::String(project_ids),
                    },
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
                    AttributeColumn {
                        attribute: AttributeName("assignee".into()),
                        values: Values::String(
                            (0..3)
                                .map(|index| user_ids[index % user_ids.len()].clone())
                                .collect(),
                        ),
                    },
                ],
            })],
        })?;
        Ok(())
    }
}

fn project_ids_by_prefix(
    data_store: &dyn DataStore,
) -> joi_error::JoiResult<HashMap<JoiString, JoiString>> {
    let result = data_store.query(DataStoreQuery {
        table_name: TableName("projects".into()),
        criterion: QueryCriterion::MatchAny,
        max_results: 100,
        attributes: vec![AttributeName("id".into()), AttributeName("prefix".into())],
    })?;
    let Values::String(ids) = &result.result_columns[0].values else {
        return Err(joi_error::joi_error!("project IDs must be strings"));
    };
    let Values::String(prefixes) = &result.result_columns[1].values else {
        return Err(joi_error::joi_error!("project prefixes must be strings"));
    };
    let mut projects = HashMap::new();
    for (prefix, id) in prefixes.iter().cloned().zip(ids.iter().cloned()) {
        if projects.insert(prefix.clone(), id).is_some() {
            return Err(joi_error::joi_error!(
                "project prefix `{prefix}` is defined more than once"
            ));
        }
    }
    Ok(projects)
}

fn project_for_key(
    projects: &HashMap<JoiString, JoiString>,
    key: &str,
) -> joi_error::JoiResult<JoiString> {
    let prefix = key.split_once('-').map_or(key, |(prefix, _)| prefix);
    projects
        .get(prefix)
        .cloned()
        .ok_or_else(|| joi_error::joi_error!("ticket key `{key}` has no matching project"))
}

fn associate_existing_tickets(
    data_store: &mut dyn DataStore,
    projects: &HashMap<JoiString, JoiString>,
) -> joi_error::JoiResult<()> {
    let result = data_store.query(DataStoreQuery {
        table_name: TableName("tickets".into()),
        criterion: QueryCriterion::MatchAny,
        max_results: 10_000,
        attributes: vec![
            AttributeName("id".into()),
            AttributeName("key".into()),
            AttributeName("project_id".into()),
        ],
    })?;
    let Values::String(ids) = &result.result_columns[0].values else {
        return Err(joi_error::joi_error!("ticket IDs must be strings"));
    };
    let Values::String(keys) = &result.result_columns[1].values else {
        return Err(joi_error::joi_error!("ticket keys must be strings"));
    };
    let Values::String(project_ids) = &result.result_columns[2].values else {
        return Err(joi_error::joi_error!("ticket project IDs must be strings"));
    };
    let assignments = ids
        .iter()
        .zip(keys)
        .zip(project_ids)
        .filter(|(_, project_id)| project_id.is_empty())
        .map(|((id, key), _)| Ok((id.clone(), project_for_key(projects, key)?)))
        .collect::<joi_error::JoiResult<Vec<_>>>()?;
    if assignments.is_empty() {
        return Ok(());
    }
    let (ids, project_ids): (Vec<_>, Vec<_>) = assignments.into_iter().unzip();
    data_store.mutate(DataStoreMutation {
        steps: vec![DataStoreMutationStep::Update(
            joi_server::data_store::DataStoreUpdateMutation {
                table_name: TableName("tickets".into()),
                ids,
                columns: vec![AttributeColumn {
                    attribute: AttributeName("project_id".into()),
                    values: Values::String(project_ids),
                }],
            },
        )],
    })?;
    Ok(())
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

#[cfg(test)]
mod tests {
    use joi_server::data_store::{
        AttributeColumn, AttributeName, ColumnDataType, DataStore, DataStoreMutation,
        DataStoreMutationStep, DataStoreQuery, QueryCriterion, TableDescriptionProvider, TableName,
        TestDataProvider, Values,
    };
    use joi_server::sqlite_data_store::SqliteDataStore;
    use joi_server::user_session_command::{UserTableDescriptionProvider, UserTestDataProvider};

    use crate::projects_module::{ProjectTableDescriptionProvider, ProjectTestDataProvider};

    use super::{TicketTableDescriptionProvider, TicketTestDataProvider};

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
            [
                "id",
                "key",
                "project_id",
                "title",
                "description",
                "status",
                "assignee"
            ]
        );
        assert!(
            table
                .columns
                .iter()
                .all(|column| column.data_type == ColumnDataType::String)
        );
        let assignee = table
            .columns
            .iter()
            .find(|column| column.name.0 == "assignee")
            .unwrap();
        assert!(assignee.optional);
        assert_eq!(assignee.references.as_ref().unwrap().table.0, "users");
        assert_eq!(assignee.references.as_ref().unwrap().attribute.0, "id");
        let project = table
            .columns
            .iter()
            .find(|column| column.name.0 == "project_id")
            .unwrap();
        assert!(project.optional);
        assert_eq!(project.references.as_ref().unwrap().table.0, "projects");
        assert_eq!(project.references.as_ref().unwrap().attribute.0, "id");
    }

    #[test]
    fn inserts_test_tickets() {
        let mut store = SqliteDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![
                UserTableDescriptionProvider.table_description(),
                ProjectTableDescriptionProvider.table_description(),
                TicketTableDescriptionProvider.table_description(),
            ])
            .unwrap();
        UserTestDataProvider.insert_test_data(&mut store).unwrap();
        ProjectTestDataProvider
            .insert_test_data(&mut store)
            .unwrap();

        TicketTestDataProvider.insert_test_data(&mut store).unwrap();

        let result = store
            .query(DataStoreQuery {
                table_name: TableName("tickets".into()),
                criterion: QueryCriterion::MatchAny,
                max_results: 10,
                attributes: vec![
                    AttributeName("id".into()),
                    AttributeName("key".into()),
                    AttributeName("project_id".into()),
                    AttributeName("status".into()),
                    AttributeName("assignee".into()),
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
                == ["TEST-1", "TEST-2", "DEMO-1"]
        ));
        assert!(matches!(
            &result.result_columns[2].values,
            Values::String(values) if values.iter().all(|value| ksuid::Ksuid::from_base62(value).is_ok())
        ));
        assert!(matches!(
            &result.result_columns[4].values,
            Values::String(values) if values.iter().all(|value| ksuid::Ksuid::from_base62(value).is_ok())
        ));

        let Values::String(ticket_ids) = &result.result_columns[0].values else {
            unreachable!()
        };
        store
            .mutate(DataStoreMutation {
                steps: vec![DataStoreMutationStep::Update(
                    joi_server::data_store::DataStoreUpdateMutation {
                        table_name: TableName("tickets".into()),
                        ids: vec![ticket_ids[0].clone()],
                        columns: vec![
                            AttributeColumn {
                                attribute: AttributeName("assignee".into()),
                                values: Values::NullableString(vec![None]),
                            },
                            AttributeColumn {
                                attribute: AttributeName("project_id".into()),
                                values: Values::NullableString(vec![None]),
                            },
                        ],
                    },
                )],
            })
            .unwrap();
        TicketTestDataProvider.insert_test_data(&mut store).unwrap();
        let after_reinitialization = store
            .query(DataStoreQuery {
                table_name: TableName("tickets".into()),
                criterion: QueryCriterion::MatchAny,
                max_results: 10,
                attributes: vec![
                    AttributeName("assignee".into()),
                    AttributeName("project_id".into()),
                ],
            })
            .unwrap();
        assert_eq!(after_reinitialization.number_of_hits, 3);
        assert!(matches!(
            &after_reinitialization.result_columns[0].values,
            Values::String(values) if values[0].is_empty()
        ));
        assert!(matches!(
            &after_reinitialization.result_columns[1].values,
            Values::String(values) if values.iter().all(|value| !value.is_empty())
        ));
    }
}
