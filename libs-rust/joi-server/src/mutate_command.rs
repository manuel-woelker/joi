use joi_base::JoiString;
use joi_error::{JoiResult, joi_error, report};
use serde::{Deserialize, Serialize};

use crate::command::Command;
use crate::command_handler::CommandHandler;
use crate::data_store::{
    AttributeColumn, AttributeName, DataStoreDeleteMutation, DataStoreInsertMutation,
    DataStoreMutation, DataStoreMutationStep, DataStoreUpdateMutation, SharedDataStore, TableName,
    Values,
};

/// Applies generic data-store mutations supplied through the command registry.
pub struct MutateCommand {
    data_store: SharedDataStore,
}

impl MutateCommand {
    /// Creates a mutation command using the shared data store.
    pub fn new(data_store: SharedDataStore) -> Self {
        Self { data_store }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
/// Request containing mutation steps committed in datastore chunks.
pub struct MutateRequest {
    steps: Vec<MutateRequestStep>,
    /// Return final surviving entities, including contributor-generated attributes.
    #[serde(default)]
    return_entities: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum MutateRequestStep {
    Insert(InsertRequest),
    Update(UpdateRequest),
    Delete(DeleteRequest),
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct InsertRequest {
    table_name: JoiString,
    columns: Vec<MutationColumn>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UpdateRequest {
    table_name: JoiString,
    ids: Vec<JoiString>,
    columns: Vec<MutationColumn>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DeleteRequest {
    table_name: JoiString,
    ids: Vec<JoiString>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MutationColumn {
    attribute: JoiString,
    values: MutationValues,
}

#[derive(Deserialize)]
#[serde(tag = "type", content = "values", rename_all = "snake_case")]
enum MutationValues {
    String(Vec<JoiString>),
    NullableString(Vec<Option<JoiString>>),
    Int(Vec<i64>),
    ReferenceList(Vec<Vec<JoiString>>),
}

#[derive(Debug, PartialEq, Serialize)]
/// Final entity values are omitted unless explicitly requested by an interactive client.
pub struct MutateResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    entities: Option<Vec<MutatedEntity>>,
}

#[derive(Debug, PartialEq, Serialize)]
struct MutatedEntity {
    table_name: JoiString,
    id: JoiString,
    values: serde_json::Map<String, serde_json::Value>,
}

impl Command for MutateRequest {
    const NAME: &'static str = "mutate";
    const DESCRIPTION: &'static str = "Mutates records in data-store tables";
    type Response = MutateResponse;
}

impl CommandHandler for MutateCommand {
    type Command = MutateRequest;

    fn execute(
        &self,
        context: &crate::command_handler::CommandContext,
        request: Self::Command,
    ) -> JoiResult<MutateResponse> {
        let mutation = DataStoreMutation {
            steps: request.steps.into_iter().map(mutation_step).collect(),
            return_entities: request.return_entities,
        };
        let result = self
            .data_store
            .lock()
            .map_err(|_| joi_error!("data store lock is poisoned"))?
            .mutate(
                &crate::mutation_contributor::MutationContext::for_user(context.user.as_ref()),
                mutation,
            )?;
        let entities = result
            .entities
            .map(|entities| {
                entities
                    .into_iter()
                    .map(|entity| {
                        Ok(MutatedEntity {
                            table_name: entity.entity_type.0,
                            id: String::from_utf8(entity.id.0).map_err(report)?.into(),
                            values: serde_json::from_slice(&entity.data).map_err(report)?,
                        })
                    })
                    .collect::<JoiResult<Vec<_>>>()
            })
            .transpose()?;
        Ok(MutateResponse { entities })
    }
}

fn mutation_step(step: MutateRequestStep) -> DataStoreMutationStep {
    match step {
        MutateRequestStep::Insert(insert) => {
            DataStoreMutationStep::Insert(DataStoreInsertMutation {
                table_name: TableName(insert.table_name),
                columns: insert.columns.into_iter().map(attribute_column).collect(),
            })
        }
        MutateRequestStep::Update(update) => {
            DataStoreMutationStep::Update(DataStoreUpdateMutation {
                table_name: TableName(update.table_name),
                ids: update.ids,
                columns: update.columns.into_iter().map(attribute_column).collect(),
            })
        }
        MutateRequestStep::Delete(delete) => {
            DataStoreMutationStep::Delete(DataStoreDeleteMutation {
                table_name: TableName(delete.table_name),
                ids: delete.ids,
            })
        }
    }
}

fn attribute_column(column: MutationColumn) -> AttributeColumn {
    AttributeColumn {
        attribute: AttributeName(column.attribute),
        values: match column.values {
            MutationValues::String(values) => Values::String(values),
            MutationValues::NullableString(values) => Values::NullableString(values),
            MutationValues::Int(values) => Values::Int(values),
            MutationValues::ReferenceList(values) => Values::ReferenceList(values),
        },
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use crate::command_handler::CommandHandler;
    use crate::data_store::{DataStore, DataStoreQuery, QueryCriterion, TableDescriptionProvider};
    use crate::storage::IndexedDataStore;
    use crate::user_session_command::UserTableDescriptionProvider;

    use super::{
        DeleteRequest, InsertRequest, MutateCommand, MutateRequest, MutateRequestStep,
        MutationColumn, MutationValues, UpdateRequest,
    };

    #[test]
    fn returns_final_values_including_generated_attributes_only_when_requested() {
        let mut store = IndexedDataStore::in_memory().unwrap();
        let mut table = UserTableDescriptionProvider.table_description();
        table.presentation = None;
        table.columns.push(crate::data_store::ColumnDescription {
            name: crate::data_store::AttributeName("update_date".into()),
            description: "Last modification".into(),
            data_type: crate::data_store::ColumnDataType::String,
            optional: false,
        });
        store.ensure_tables(vec![table]).unwrap();
        let command = MutateCommand::new(Arc::new(Mutex::new(Box::new(store))));
        let execute = |request| {
            command
                .execute(
                    &Default::default(),
                    serde_json::from_value(request).unwrap(),
                )
                .unwrap()
        };
        let response = execute(serde_json::json!({"steps": [{"insert": {
            "table_name": "users", "columns": [
                {"attribute": "id", "values": {"type": "string", "values": ["user-1"]}},
                {"attribute": "username", "values": {"type": "string", "values": ["jane"]}},
                {"attribute": "name", "values": {"type": "string", "values": ["Jane"]}}
            ]
        }}]}));
        assert_eq!(
            serde_json::to_value(response).unwrap(),
            serde_json::json!({})
        );
        let response = execute(
            serde_json::json!({"return_entities": true, "steps": [{"update": {
                "table_name": "users", "ids": ["user-1"], "columns": [
                    {"attribute": "name", "values": {"type": "string", "values": ["Jane Developer"]}}
                ]
            }}]}),
        );
        let entities = response.entities.unwrap();
        assert_eq!(entities.len(), 1);
        assert_eq!(entities[0].table_name, "users");
        assert_eq!(entities[0].id, "user-1");
        assert_eq!(entities[0].values["name"], "Jane Developer");
        assert!(
            !entities[0].values["update_date"]
                .as_str()
                .unwrap()
                .is_empty()
        );
        let response = execute(
            serde_json::json!({"return_entities": true, "steps": [{"delete": {
                "table_name": "users", "ids": ["user-1"]
            }}]}),
        );
        assert_eq!(response.entities, Some(vec![]));
    }

    #[test]
    fn applies_insert_and_update_steps_atomically() {
        let mut store = IndexedDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![UserTableDescriptionProvider.table_description()])
            .unwrap();
        let store = Arc::new(Mutex::new(Box::new(store) as Box<dyn DataStore>));
        let command = MutateCommand::new(store.clone());

        command
            .execute(
                &Default::default(),
                MutateRequest {
                    return_entities: false,
                    steps: vec![
                        MutateRequestStep::Insert(InsertRequest {
                            table_name: "users".into(),
                            columns: vec![
                                strings("id", ["user-1"]),
                                strings("username", ["jane.developer"]),
                                strings("name", ["Jane Developer"]),
                            ],
                        }),
                        MutateRequestStep::Update(UpdateRequest {
                            table_name: "users".into(),
                            ids: vec!["user-1".into()],
                            columns: vec![strings("name", ["Jane Engineer"])],
                        }),
                    ],
                },
            )
            .unwrap();

        let result = store
            .lock()
            .unwrap()
            .query(DataStoreQuery {
                table_name: crate::data_store::TableName("users".into()),
                criterion: QueryCriterion::MatchAny,
                sorting: Vec::new(),
                max_results: 10,
                attributes: vec![crate::data_store::AttributeName("name".into())],
            })
            .unwrap();
        assert!(matches!(
            &result.result_columns[0].values,
            crate::data_store::Values::String(values) if values.as_slice() == ["Jane Engineer"]
        ));
    }

    #[test]
    fn preserves_completed_chunks_when_a_later_step_fails() {
        let mut store = IndexedDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![UserTableDescriptionProvider.table_description()])
            .unwrap();
        let store = Arc::new(Mutex::new(Box::new(store) as Box<dyn DataStore>));
        let command = MutateCommand::new(store.clone());

        let error = command
            .execute(
                &Default::default(),
                MutateRequest {
                    return_entities: false,
                    steps: vec![
                        MutateRequestStep::Insert(InsertRequest {
                            table_name: "users".into(),
                            columns: vec![
                                strings("id", ["user-1"]),
                                strings("username", ["jane.developer"]),
                                strings("name", ["Jane Developer"]),
                            ],
                        }),
                        MutateRequestStep::Update(UpdateRequest {
                            table_name: "users".into(),
                            ids: vec!["missing".into()],
                            columns: vec![strings("name", ["Missing User"])],
                        }),
                    ],
                },
            )
            .unwrap_err();
        assert!(error.to_string().contains("no record with ID `missing`"));

        let result = store
            .lock()
            .unwrap()
            .query(DataStoreQuery {
                table_name: crate::data_store::TableName("users".into()),
                criterion: QueryCriterion::MatchAny,
                sorting: Vec::new(),
                max_results: 0,
                attributes: Vec::new(),
            })
            .unwrap();
        assert_eq!(result.number_of_hits, 1);
    }

    #[test]
    fn deletes_records_by_primary_key() {
        let mut store = IndexedDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![UserTableDescriptionProvider.table_description()])
            .unwrap();
        let store = Arc::new(Mutex::new(Box::new(store) as Box<dyn DataStore>));
        let command = MutateCommand::new(store.clone());
        command
            .execute(
                &Default::default(),
                MutateRequest {
                    return_entities: false,
                    steps: vec![
                        MutateRequestStep::Insert(InsertRequest {
                            table_name: "users".into(),
                            columns: vec![
                                strings("id", ["user-1"]),
                                strings("username", ["jane.developer"]),
                                strings("name", ["Jane Developer"]),
                            ],
                        }),
                        MutateRequestStep::Delete(DeleteRequest {
                            table_name: "users".into(),
                            ids: vec!["user-1".into()],
                        }),
                    ],
                },
            )
            .unwrap();

        let result = store
            .lock()
            .unwrap()
            .query(DataStoreQuery {
                table_name: crate::data_store::TableName("users".into()),
                criterion: QueryCriterion::MatchAny,
                sorting: Vec::new(),
                max_results: 0,
                attributes: Vec::new(),
            })
            .unwrap();
        assert_eq!(result.number_of_hits, 0);
    }

    #[test]
    fn converts_integer_columns() {
        let column = super::attribute_column(MutationColumn {
            attribute: "priority".into(),
            values: MutationValues::Int(vec![3, 5]),
        });
        assert!(
            matches!(column.values, crate::data_store::Values::Int(values) if values == [3, 5])
        );
    }

    fn strings<const N: usize>(attribute: &str, values: [&str; N]) -> MutationColumn {
        MutationColumn {
            attribute: attribute.into(),
            values: MutationValues::String(values.into_iter().map(Into::into).collect()),
        }
    }
}
