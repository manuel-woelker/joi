use joi_base::JoiString;
use joi_error::{JoiResult, joi_error};
use serde::{Deserialize, Serialize};

use crate::command::{Command, CommandDescriptor, CommandRequest};
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
    pub fn new(data_store: SharedDataStore) -> Self {
        Self { data_store }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MutateRequest {
    steps: Vec<MutateRequestStep>,
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
}

#[derive(Debug, PartialEq, Serialize)]
pub struct MutateResponse {}

impl CommandRequest for MutateRequest {
    type Response = MutateResponse;
}

impl Command for MutateCommand {
    type Request = MutateRequest;

    fn descriptor() -> CommandDescriptor {
        CommandDescriptor {
            name: "mutate".into(),
            description: "Mutates records in data-store tables".into(),
        }
    }

    fn execute(&self, request: Self::Request) -> JoiResult<MutateResponse> {
        let mutation = DataStoreMutation {
            steps: request.steps.into_iter().map(mutation_step).collect(),
        };
        self.data_store
            .lock()
            .map_err(|_| joi_error!("data store lock is poisoned"))?
            .mutate(mutation)?;
        Ok(MutateResponse {})
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
        },
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use crate::command::Command;
    use crate::data_store::{DataStore, DataStoreQuery, QueryCriterion, TableDescriptionProvider};
    use crate::sqlite_data_store::SqliteDataStore;
    use crate::tickets_module::UserTableDescriptionProvider;

    use super::{
        DeleteRequest, InsertRequest, MutateCommand, MutateRequest, MutateRequestStep,
        MutationColumn, MutationValues, UpdateRequest,
    };

    #[test]
    fn applies_insert_and_update_steps_atomically() {
        let mut store = SqliteDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![UserTableDescriptionProvider.table_description()])
            .unwrap();
        let store = Arc::new(Mutex::new(Box::new(store) as Box<dyn DataStore>));
        let command = MutateCommand::new(store.clone());

        command
            .execute(MutateRequest {
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
            })
            .unwrap();

        let result = store
            .lock()
            .unwrap()
            .query(DataStoreQuery {
                table_name: crate::data_store::TableName("users".into()),
                criterion: QueryCriterion::MatchAny,
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
    fn rolls_back_earlier_steps_when_an_update_target_is_missing() {
        let mut store = SqliteDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![UserTableDescriptionProvider.table_description()])
            .unwrap();
        let store = Arc::new(Mutex::new(Box::new(store) as Box<dyn DataStore>));
        let command = MutateCommand::new(store.clone());

        let error = command
            .execute(MutateRequest {
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
            })
            .unwrap_err();
        assert!(error.to_string().contains("no record with ID `missing`"));

        let result = store
            .lock()
            .unwrap()
            .query(DataStoreQuery {
                table_name: crate::data_store::TableName("users".into()),
                criterion: QueryCriterion::MatchAny,
                max_results: 0,
                attributes: Vec::new(),
            })
            .unwrap();
        assert_eq!(result.number_of_hits, 0);
    }

    #[test]
    fn deletes_records_by_primary_key() {
        let mut store = SqliteDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![UserTableDescriptionProvider.table_description()])
            .unwrap();
        let store = Arc::new(Mutex::new(Box::new(store) as Box<dyn DataStore>));
        let command = MutateCommand::new(store.clone());
        command
            .execute(MutateRequest {
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
            })
            .unwrap();

        let result = store
            .lock()
            .unwrap()
            .query(DataStoreQuery {
                table_name: crate::data_store::TableName("users".into()),
                criterion: QueryCriterion::MatchAny,
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
