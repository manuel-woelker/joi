use std::collections::HashMap;

use fake::{
    Fake,
    faker::lorem::en::{Paragraph, Sentence},
};
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

const STARTUP_TICKET_COUNT: usize = 20_000;

impl TestDataProvider for TicketTestDataProvider {
    fn insert_test_data(&self, data_store: &mut dyn DataStore) -> joi_error::JoiResult<()> {
        let projects = project_ids_by_prefix(data_store)?;
        let users = data_store.query(DataStoreQuery {
            table_name: TableName("users".into()),
            criterion: QueryCriterion::MatchAny,
            sorting: Vec::new(),
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
        let mut existing_count = data_store
            .query(DataStoreQuery {
                table_name: TableName("tickets".into()),
                criterion: QueryCriterion::MatchAny,
                sorting: Vec::new(),
                max_results: 0,
                attributes: Vec::new(),
            })?
            .number_of_hits;
        if existing_count == 0 {
            insert_representative_tickets(data_store, &projects, user_ids)?;
            existing_count = 3;
        }
        associate_existing_tickets(data_store, &projects)?;
        generate_tickets(
            data_store,
            STARTUP_TICKET_COUNT.saturating_sub(existing_count),
            existing_count,
            &projects,
            user_ids,
        )?;
        Ok(())
    }
}

fn insert_representative_tickets(
    data_store: &mut dyn DataStore,
    projects: &HashMap<JoiString, JoiString>,
    user_ids: &[JoiString],
) -> joi_error::JoiResult<()> {
    let keys = ["TEST-1", "TEST-2", "DEMO-1"];
    let project_ids = keys
        .iter()
        .map(|key| project_for_key(projects, key))
        .collect::<joi_error::JoiResult<Vec<_>>>()?;
    data_store.mutate(DataStoreMutation {
        steps: vec![DataStoreMutationStep::Insert(DataStoreInsertMutation {
            table_name: TableName("tickets".into()),
            columns: vec![
                string_values_column(
                    "id",
                    (0..3)
                        .map(|_| ksuid::Ksuid::generate().to_base62().into())
                        .collect(),
                ),
                string_values_column("key", keys.into_iter().map(Into::into).collect()),
                string_values_column("project_id", project_ids),
                string_values_column(
                    "title",
                    [
                        "Fix navigation bug",
                        "Add issue filters",
                        "Review table schema",
                    ]
                    .into_iter()
                    .map(Into::into)
                    .collect(),
                ),
                string_values_column(
                    "description",
                    [
                        "Navigation loses the selected view after reload",
                        "Allow views to filter issues by workflow status",
                        "Check the initial ticket storage definition",
                    ]
                    .into_iter()
                    .map(Into::into)
                    .collect(),
                ),
                string_values_column(
                    "status",
                    ["open", "in-progress", "closed"]
                        .into_iter()
                        .map(Into::into)
                        .collect(),
                ),
                string_values_column(
                    "assignee",
                    (0..3)
                        .map(|index| user_ids[index % user_ids.len()].clone())
                        .collect(),
                ),
            ],
        })],
    })?;
    Ok(())
}

pub(crate) fn generate_additional_tickets(
    data_store: &mut dyn DataStore,
    count: usize,
) -> joi_error::JoiResult<usize> {
    let projects = project_ids_by_prefix(data_store)?;
    let users = data_store.query(DataStoreQuery {
        table_name: TableName("users".into()),
        criterion: QueryCriterion::MatchAny,
        sorting: Vec::new(),
        max_results: 1_000,
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
        sorting: Vec::new(),
        max_results: 0,
        attributes: Vec::new(),
    })?;
    generate_tickets(
        data_store,
        count,
        existing.number_of_hits,
        &projects,
        user_ids,
    )?;
    Ok(count)
}

fn generate_tickets(
    data_store: &mut dyn DataStore,
    count: usize,
    offset: usize,
    projects: &HashMap<JoiString, JoiString>,
    user_ids: &[JoiString],
) -> joi_error::JoiResult<()> {
    if count == 0 {
        return Ok(());
    }
    let test_project = projects
        .get("TEST")
        .ok_or_else(|| joi_error::joi_error!("TEST project is not defined"))?;
    let mut ids = Vec::with_capacity(count);
    let mut keys = Vec::with_capacity(count);
    let mut project_ids = Vec::with_capacity(count);
    let mut titles = Vec::with_capacity(count);
    let mut descriptions = Vec::with_capacity(count);
    let mut statuses = Vec::with_capacity(count);
    let mut assignees = Vec::with_capacity(count);
    let statuses_available = ["open", "in-progress", "closed"];
    for index in 0..count {
        ids.push(ksuid::Ksuid::generate().to_base62().into());
        keys.push(format!("TEST-{}", offset + index + 1).into());
        project_ids.push(test_project.clone());
        let title: String = Sentence(4..9).fake();
        titles.push(title.trim_end_matches('.').into());
        descriptions.push(Paragraph(2..5).fake::<String>().into());
        statuses.push(statuses_available[index % statuses_available.len()].into());
        assignees.push(user_ids[index % user_ids.len()].clone());
    }
    data_store.mutate(DataStoreMutation {
        steps: vec![DataStoreMutationStep::Insert(DataStoreInsertMutation {
            table_name: TableName("tickets".into()),
            columns: vec![
                string_values_column("id", ids),
                string_values_column("key", keys),
                string_values_column("project_id", project_ids),
                string_values_column("title", titles),
                string_values_column("description", descriptions),
                string_values_column("status", statuses),
                string_values_column("assignee", assignees),
            ],
        })],
    })?;
    Ok(())
}

fn string_values_column(name: &'static str, values: Vec<JoiString>) -> AttributeColumn {
    AttributeColumn {
        attribute: AttributeName(name.into()),
        values: Values::String(values),
    }
}

fn project_ids_by_prefix(
    data_store: &dyn DataStore,
) -> joi_error::JoiResult<HashMap<JoiString, JoiString>> {
    let result = data_store.query(DataStoreQuery {
        table_name: TableName("projects".into()),
        criterion: QueryCriterion::MatchAny,
        sorting: Vec::new(),
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
        sorting: Vec::new(),
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

    use super::{STARTUP_TICKET_COUNT, TicketTableDescriptionProvider, TicketTestDataProvider};

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
                sorting: Vec::new(),
                max_results: STARTUP_TICKET_COUNT,
                attributes: vec![
                    AttributeName("id".into()),
                    AttributeName("key".into()),
                    AttributeName("project_id".into()),
                    AttributeName("status".into()),
                    AttributeName("assignee".into()),
                ],
            })
            .unwrap();
        assert_eq!(result.number_of_hits, STARTUP_TICKET_COUNT);
        assert!(matches!(
            &result.result_columns[0].values,
            Values::String(values) if values.iter().map(|value| value.as_str()).collect::<Vec<_>>().iter()
                .all(|value| ksuid::Ksuid::from_base62(value).is_ok())
        ));
        assert!(matches!(
            &result.result_columns[1].values,
            Values::String(values) if ["TEST-1", "TEST-2", "DEMO-1"]
                .iter().all(|expected| values.iter().any(|value| value == *expected))
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
                sorting: Vec::new(),
                max_results: 10,
                attributes: vec![
                    AttributeName("assignee".into()),
                    AttributeName("project_id".into()),
                ],
            })
            .unwrap();
        assert_eq!(after_reinitialization.number_of_hits, STARTUP_TICKET_COUNT);
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
