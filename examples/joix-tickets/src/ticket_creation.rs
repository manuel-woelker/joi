use std::collections::{HashMap, HashSet};

use joi_error::{JoiResult, joi_bail, joi_error, report};
use joi_server::{
    data_store::{AttributeName, TableName},
    mutation_contributor::{
        EntityMutation, MutationContext, MutationContributor, MutationEntries, MutationPreparation,
    },
};
use serde_json::{Map, Value};

/// Assigns immutable ticket keys and creation timestamps using private per-project counters.
pub struct TicketCreation;

fn counters() -> TableName {
    TableName("ticket_project_counters".into())
}

impl MutationContributor for TicketCreation {
    fn applies_to(&self, table: &TableName) -> bool {
        table.0 == "tickets"
    }
    fn buckets(&self) -> Vec<TableName> {
        vec![counters()]
    }
    fn generated_attributes(&self, _: &TableName) -> Vec<AttributeName> {
        vec![
            AttributeName("key".into()),
            AttributeName("creation_date".into()),
        ]
    }
    fn prepare_insert(
        &self,
        context: &MutationContext,
        table: &TableName,
        records: &mut [Map<String, Value>],
        preparation: &mut MutationPreparation<'_>,
    ) -> JoiResult<()> {
        let ids = records
            .iter()
            .map(|record| string(record, "id"))
            .collect::<JoiResult<Vec<_>>>()?;
        if ids.iter().collect::<HashSet<_>>().len() != ids.len() {
            joi_bail!("ticket insert contains duplicate IDs");
        }
        let keys = ids.iter().map(|id| id.as_bytes()).collect::<Vec<_>>();
        if !preparation.store().query_ids(table, &keys)?.is_empty() {
            joi_bail!("ticket insert cannot replace an existing ticket; use update");
        }

        let project_ids = records
            .iter()
            .map(|record| string(record, "project_id").map(str::to_owned))
            .collect::<JoiResult<HashSet<_>>>()?;
        let mut projects = HashMap::new();
        let mut prefixes = HashSet::new();
        let mut cursor = None;
        loop {
            let page = preparation.store().query_page(
                &TableName("projects".into()),
                cursor.as_deref(),
                1000,
            )?;
            if page.is_empty() {
                break;
            }
            cursor = page.last().map(|entry| entry.key.clone());
            for entry in page {
                let object: Map<String, Value> =
                    serde_json::from_slice(&entry.value).map_err(report)?;
                let prefix = string(&object, "prefix")?;
                if !prefixes.insert(prefix.to_owned()) {
                    joi_bail!("project prefix `{prefix}` is not unique");
                }
                if project_ids.contains(string(&object, "id")?) {
                    if !valid_prefix(prefix) {
                        joi_bail!("invalid project prefix `{prefix}`");
                    }
                    projects.insert(string(&object, "id")?.to_owned(), prefix.to_owned());
                }
            }
        }
        let mut next = HashMap::new();
        let mut missing = HashSet::new();
        for project in &project_ids {
            if !projects.contains_key(project) {
                joi_bail!("ticket project `{project}` does not exist");
            }
            if let Some(bytes) = preparation.state(&counters(), project.as_bytes())? {
                let state: Value = serde_json::from_slice(&bytes).map_err(report)?;
                let value = state
                    .get("next_number")
                    .and_then(Value::as_u64)
                    .ok_or_else(|| joi_error!("invalid project counter"))?;
                if value == 0 {
                    joi_bail!("invalid next ticket number");
                }
                next.insert(project.clone(), value);
                if state.get("prefix").and_then(Value::as_str) != Some(projects[project].as_str()) {
                    missing.insert(project.clone());
                }
            } else {
                missing.insert(project.clone());
            }
        }
        // Bootstrap counters once from authoritative legacy data, never from row count
        // or the lagging search index. Deletions thereafter cannot reuse numbers.
        if !missing.is_empty() {
            for id in &missing {
                next.entry(id.clone()).or_insert(1);
            }
            let mut cursor = None;
            loop {
                let page = preparation
                    .store()
                    .query_page(table, cursor.as_deref(), 50_000)?;
                if page.is_empty() {
                    break;
                }
                cursor = page.last().map(|entry| entry.key.clone());
                for entry in page {
                    let record: Map<String, Value> =
                        serde_json::from_slice(&entry.value).map_err(report)?;
                    let Some((prefix, number)) = record
                        .get("key")
                        .and_then(Value::as_str)
                        .and_then(|key| key.rsplit_once('-'))
                    else {
                        continue;
                    };
                    let Ok(number) = number.parse::<u64>() else {
                        continue;
                    };
                    for project in &missing {
                        if record.get("project_id").and_then(Value::as_str)
                            == Some(project.as_str())
                            || projects[project] == prefix
                        {
                            let following = number
                                .checked_add(1)
                                .ok_or_else(|| joi_error!("ticket number exhausted"))?;
                            next.entry(project.clone())
                                .and_modify(|value| *value = (*value).max(following));
                        }
                    }
                }
            }
        }
        for record in records {
            let project = string(record, "project_id")?;
            let number = next.get_mut(project).expect("validated project");
            let key = format!("{}-{}", projects[project], number);
            *number = number
                .checked_add(1)
                .ok_or_else(|| joi_error!("ticket number exhausted"))?;
            record.insert("key".into(), Value::String(key));
            record.insert(
                "creation_date".into(),
                Value::String(context.timestamp().into()),
            );
        }
        for (project, number) in next {
            let state = serde_json::json!({ "next_number": number, "prefix": projects[&project] });
            preparation.set_state(
                counters(),
                project.into_bytes(),
                serde_json::to_vec(&state).map_err(report)?,
            )?;
        }
        Ok(())
    }
    fn contribute(
        &self,
        _: &MutationContext,
        _: &[EntityMutation],
        _: &mut MutationEntries,
    ) -> JoiResult<()> {
        Ok(())
    }
}

fn string<'a>(record: &'a Map<String, Value>, key: &str) -> JoiResult<&'a str> {
    record
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| joi_error!("ticket requires `{key}`"))
}

fn valid_prefix(value: &str) -> bool {
    value.as_bytes().first().is_some_and(u8::is_ascii_uppercase)
        && value
            .bytes()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::{
        projects_module::ProjectTableDescriptionProvider,
        tickets_module::TicketTableDescriptionProvider,
    };
    use joi_plugin::{PluginRegistryBuilder, plugin};
    use joi_server::{
        data_store::*, storage::IndexedDataStore,
        user_session_command::UserTableDescriptionProvider,
    };

    pub(crate) fn configure(store: &mut IndexedDataStore) {
        let mut builder = PluginRegistryBuilder::new();
        builder
            .register(plugin("test", "Ticket creation test", |context| {
                context.register_extension_point::<dyn MutationContributor>(
                    "mutations",
                    "Mutation contributors",
                )?;
                context.register_extension::<dyn MutationContributor>(
                    "ticket-creation",
                    "Ticket creation",
                    Box::new(TicketCreation),
                )?;
                context.register_extension::<dyn MutationContributor>(
                    "history",
                    "History",
                    Box::new(joi_server::entity_history::HistoryContributor::new(vec![
                        TableName("tickets".into()),
                    ])),
                )
            }))
            .unwrap();
        store.set_contributors(builder.build()).unwrap();
    }
    fn schemas() -> Vec<TableDescription> {
        vec![
            UserTableDescriptionProvider.table_description(),
            ProjectTableDescriptionProvider.table_description(),
            TicketTableDescriptionProvider.table_description(),
        ]
    }
    fn column(name: &str, values: &[&str]) -> AttributeColumn {
        AttributeColumn {
            attribute: AttributeName(name.into()),
            values: Values::String(values.iter().map(|value| (*value).into()).collect()),
        }
    }
    fn projects(store: &mut IndexedDataStore) {
        store
            .mutate(
                &MutationContext::system(),
                DataStoreMutation {
                    return_entities: false,
                    steps: vec![DataStoreMutationStep::Insert(DataStoreInsertMutation {
                        table_name: TableName("projects".into()),
                        columns: vec![
                            column("id", &["test", "demo"]),
                            column("prefix", &["TEST", "DEMO"]),
                            column("name", &["Test", "Demo"]),
                            column("description", &["", ""]),
                        ],
                    })],
                },
            )
            .unwrap();
    }
    fn insert(projects: &[&str]) -> DataStoreMutation {
        let ids = projects
            .iter()
            .map(|_| ksuid::Ksuid::generate().to_base62())
            .collect::<Vec<_>>();
        DataStoreMutation {
            return_entities: true,
            steps: vec![DataStoreMutationStep::Insert(DataStoreInsertMutation {
                table_name: TableName("tickets".into()),
                columns: vec![
                    column("id", &ids.iter().map(String::as_str).collect::<Vec<_>>()),
                    column("project_id", projects),
                    column("title", &vec!["Title"; projects.len()]),
                    column("description", &vec!["Description"; projects.len()]),
                    column("status", &vec!["open"; projects.len()]),
                ],
            })],
        }
    }
    fn create(store: &mut IndexedDataStore, project: &str) -> Map<String, Value> {
        let result = store
            .mutate(&MutationContext::system(), insert(&[project]))
            .unwrap();
        serde_json::from_slice(&result.entities.unwrap()[0].data).unwrap()
    }
    #[test]
    fn allocates_per_project_and_records_final_generated_values() {
        let mut store = IndexedDataStore::in_memory().unwrap();
        configure(&mut store);
        store.ensure_tables(schemas()).unwrap();
        projects(&mut store);
        let context = MutationContext::system();
        let entities = store
            .mutate(&context, insert(&["test", "demo", "test"]))
            .unwrap()
            .entities
            .unwrap();
        let records = entities
            .iter()
            .map(|entity| serde_json::from_slice::<Map<String, Value>>(&entity.data).unwrap())
            .collect::<Vec<_>>();
        assert_eq!(
            records
                .iter()
                .map(|record| record["key"].as_str().unwrap())
                .collect::<Vec<_>>(),
            ["TEST-1", "DEMO-1", "TEST-2"]
        );
        assert!(
            records
                .iter()
                .all(|record| record["creation_date"] == context.timestamp())
        );
        let history = store
            .history(joi_server::generated::api::EntityHistoryRequest {
                table: "tickets".into(),
                entity_id: records[0]["id"].as_str().unwrap().into(),
                limit: None,
                cursor: None,
            })
            .unwrap();
        assert!(
            history.entries[0]
                .changes
                .iter()
                .any(|change| change.key == "key"
                    && change.new_value == Some(Value::String("TEST-1".into())))
        );
        let mut bad = insert(&["test"]);
        if let DataStoreMutationStep::Insert(step) = &mut bad.steps[0] {
            step.columns.push(column("key", &["TEST-1000"]));
        }
        assert!(store.mutate(&context, bad).is_err());
        assert!(
            store
                .mutate(&context, insert(&["test", "missing"]))
                .is_err()
        );
        assert_eq!(create(&mut store, "test")["key"], "TEST-3");
        for attribute in ["key", "creation_date"] {
            let mutation = DataStoreMutation {
                return_entities: false,
                steps: vec![DataStoreMutationStep::Update(DataStoreUpdateMutation {
                    table_name: TableName("tickets".into()),
                    ids: vec![records[0]["id"].as_str().unwrap().into()],
                    columns: vec![column(attribute, &["tampered"])],
                })],
            };
            assert!(store.mutate(&context, mutation).is_err());
        }
        assert!(
            store
                .query(DataStoreQuery {
                    table_name: counters(),
                    criterion: QueryCriterion::MatchAny,
                    sorting: vec![],
                    max_results: 10,
                    attributes: vec![]
                })
                .is_err()
        );
    }
    #[test]
    fn keeps_counters_after_delete_and_restart() {
        let dir = tempfile::tempdir().unwrap();
        let open = || {
            let mut store =
                IndexedDataStore::open(dir.path().join("data"), dir.path().join("index")).unwrap();
            configure(&mut store);
            store.ensure_tables(schemas()).unwrap();
            store
        };
        let mut store = open();
        projects(&mut store);
        let ticket = create(&mut store, "test");
        store
            .mutate(
                &MutationContext::system(),
                DataStoreMutation {
                    return_entities: false,
                    steps: vec![DataStoreMutationStep::Delete(DataStoreDeleteMutation {
                        table_name: TableName("tickets".into()),
                        ids: vec![ticket["id"].as_str().unwrap().into()],
                    })],
                },
            )
            .unwrap();
        drop(store);
        let mut store = open();
        assert_eq!(create(&mut store, "test")["key"], "TEST-2");
    }
    #[test]
    fn bootstraps_legacy_maximum_not_row_count() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("data");
        let index = dir.path().join("index");
        let mut legacy = IndexedDataStore::open(&path, &index).unwrap();
        let mut old_schemas = schemas();
        for schema in &mut old_schemas {
            schema
                .columns
                .retain(|column| column.name.0 != "creation_date");
        }
        legacy.ensure_tables(old_schemas).unwrap();
        projects(&mut legacy);
        let mut mutation = insert(&["test"]);
        if let DataStoreMutationStep::Insert(step) = &mut mutation.steps[0] {
            step.columns.push(column("key", &["TEST-99"]));
        }
        legacy.mutate(&MutationContext::system(), mutation).unwrap();
        drop(legacy);
        let mut store = IndexedDataStore::open(&path, &index).unwrap();
        configure(&mut store);
        store.ensure_tables(schemas()).unwrap();
        assert_eq!(create(&mut store, "test")["key"], "TEST-100");
    }

    #[test]
    fn failed_history_preparation_does_not_advance_the_counter() {
        let mut store = IndexedDataStore::in_memory().unwrap();
        configure(&mut store);
        store.ensure_tables(schemas()).unwrap();
        projects(&mut store);
        let mut mutation = insert(&["test"]);
        if let DataStoreMutationStep::Insert(step) = &mut mutation.steps[0] {
            step.columns[0] = column("id", &["invalid-history-id"]);
        }
        assert!(store.mutate(&MutationContext::system(), mutation).is_err());
        assert_eq!(create(&mut store, "test")["key"], "TEST-1");
        let mut forged_date = insert(&["test"]);
        if let DataStoreMutationStep::Insert(step) = &mut forged_date.steps[0] {
            step.columns
                .push(column("creation_date", &["2020-01-01T00:00:00Z"]));
        }
        assert!(
            store
                .mutate(&MutationContext::system(), forged_date)
                .is_err()
        );
        assert_eq!(create(&mut store, "test")["key"], "TEST-2");
    }

    #[test]
    fn concurrent_callers_allocate_distinct_numbers() {
        let mut store = IndexedDataStore::in_memory().unwrap();
        configure(&mut store);
        store.ensure_tables(schemas()).unwrap();
        projects(&mut store);
        let store = std::sync::Arc::new(std::sync::Mutex::new(store));
        let threads = (0..8)
            .map(|_| {
                let store = store.clone();
                std::thread::spawn(move || {
                    create(&mut store.lock().unwrap(), "test")["key"]
                        .as_str()
                        .unwrap()
                        .to_owned()
                })
            })
            .collect::<Vec<_>>();
        let mut keys = threads
            .into_iter()
            .map(|thread| thread.join().unwrap())
            .collect::<Vec<_>>();
        keys.sort();
        assert_eq!(
            keys,
            (1..=8)
                .map(|number| format!("TEST-{number}"))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn prefix_changes_preserve_keys_and_avoid_historical_collisions() {
        let mut store = IndexedDataStore::in_memory().unwrap();
        configure(&mut store);
        store.ensure_tables(schemas()).unwrap();
        projects(&mut store);
        create(&mut store, "test");
        create(&mut store, "test");
        let demo = create(&mut store, "demo");
        let rename = |store: &mut IndexedDataStore, id: &str, prefix: &str| {
            store
                .mutate(
                    &MutationContext::system(),
                    DataStoreMutation {
                        return_entities: false,
                        steps: vec![DataStoreMutationStep::Update(DataStoreUpdateMutation {
                            table_name: TableName("projects".into()),
                            ids: vec![id.into()],
                            columns: vec![column("prefix", &[prefix])],
                        })],
                    },
                )
                .unwrap();
        };
        rename(&mut store, "test", "NEW");
        rename(&mut store, "demo", "TEST");
        assert_eq!(create(&mut store, "demo")["key"], "TEST-3");
        assert_eq!(demo["key"], "DEMO-1");
    }
}
