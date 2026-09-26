use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};

use joi_error::{JoiResult, joi_bail};
use joi_plugin::{PluginRegistry, PluginRegistryBuilder, plugin};
use serde_json::json;

use crate::{
    Entity, EntityId,
    command_handler::CommandUser,
    data_store::*,
    entity_history::{HistoryContributor, history_table},
    generated::api::{EntityHistoryRequest, HistoryEntry, HistoryOperation},
    key_value_store::*,
    mutation_contributor::*,
    redb_key_value_store::RedbKeyValueStore,
    search_index::SearchIndex,
    storage::IndexedDataStore,
};

fn registry(fail: bool) -> PluginRegistry {
    let mut builder = PluginRegistryBuilder::new();
    builder
        .register(plugin("history", "History test", move |context| {
            context.register_extension_point::<dyn MutationContributor>(
                "mutations",
                "Transactional contributions",
            )?;
            context.register_extension::<dyn MutationContributor>(
                "history",
                "Audit entities",
                Box::new(HistoryContributor::new(vec![
                    TableName("tickets".into()),
                    TableName("projects".into()),
                ])),
            )?;
            if fail {
                context.register_extension::<dyn MutationContributor>(
                    "fail",
                    "Reject transactions",
                    Box::new(Reject),
                )?;
            }
            Ok(())
        }))
        .unwrap();
    builder.build()
}

struct Reject;
impl MutationContributor for Reject {
    fn applies_to(&self, _: &TableName) -> bool {
        true
    }
    fn buckets(&self) -> Vec<TableName> {
        vec![]
    }
    fn contribute(
        &self,
        _: &MutationContext,
        _: &[EntityMutation],
        _: &mut MutationEntries,
    ) -> JoiResult<()> {
        joi_bail!("contributor failed")
    }
}

fn tables() -> Vec<TableDescription> {
    ["tickets", "projects", "users"]
        .into_iter()
        .map(|name| TableDescription {
            name: TableName(name.into()),
            discoverable: true,
            columns: ["id", "name", "assignee"]
                .into_iter()
                .map(|name| ColumnDescription {
                    name: AttributeName(name.into()),
                    description: name.into(),
                    data_type: ColumnDataType::String,
                    optional: name == "assignee",
                })
                .collect(),
        })
        .collect()
}

fn column(key: &str, value: &str) -> AttributeColumn {
    AttributeColumn {
        attribute: AttributeName(key.into()),
        values: Values::String(vec![value.into()]),
    }
}
fn insert(table: &str, id: &str, name: &str) -> DataStoreMutationStep {
    DataStoreMutationStep::Insert(DataStoreInsertMutation {
        table_name: TableName(table.into()),
        columns: vec![column("id", id), column("name", name)],
    })
}
fn update(id: &str, columns: Vec<AttributeColumn>) -> DataStoreMutationStep {
    DataStoreMutationStep::Update(DataStoreUpdateMutation {
        table_name: TableName("tickets".into()),
        ids: vec![id.into()],
        columns,
    })
}
fn delete(id: &str) -> DataStoreMutationStep {
    DataStoreMutationStep::Delete(DataStoreDeleteMutation {
        table_name: TableName("tickets".into()),
        ids: vec![id.into()],
    })
}
fn mutate(
    store: &mut dyn DataStore,
    steps: Vec<DataStoreMutationStep>,
) -> JoiResult<DataStoreMutationResult> {
    store.mutate(
        &MutationContext::system(),
        DataStoreMutation {
            steps,
            return_entities: false,
        },
    )
}
fn request(table: &str, id: &str) -> EntityHistoryRequest {
    EntityHistoryRequest {
        table: table.into(),
        entity_id: id.into(),
        cursor: None,
        limit: None,
    }
}
fn setup() -> IndexedDataStore {
    let mut store = IndexedDataStore::in_memory().unwrap();
    store.set_contributors(registry(false)).unwrap();
    store.ensure_tables(tables()).unwrap();
    store
}

#[test]
fn records_real_changes_with_presence_and_user_attribution() {
    let mut store = setup();
    let id = ksuid::Ksuid::generate().to_base62();
    mutate(&mut store, vec![insert("tickets", &id, "First")]).unwrap();
    let user = CommandUser {
        id: "jane".into(),
        username: "jane.developer".into(),
    };
    store
        .mutate(
            &MutationContext::for_user(Some(&user)),
            DataStoreMutation {
                return_entities: false,
                steps: vec![update(
                    &id,
                    vec![
                        column("name", "Second"),
                        AttributeColumn {
                            attribute: AttributeName("assignee".into()),
                            values: Values::NullableString(vec![None]),
                        },
                    ],
                )],
            },
        )
        .unwrap();
    mutate(
        &mut store,
        vec![
            update(&id, vec![column("name", "Second")]),
            delete(&id),
            delete(&id),
        ],
    )
    .unwrap();
    let entries = store.history(request("tickets", &id)).unwrap().entries;
    assert_eq!(entries.len(), 3);
    let change = entries
        .iter()
        .find(|entry| entry.r#type == HistoryOperation::Update)
        .unwrap();
    assert_eq!(change.userid, "jane");
    assert!(change.changes[0].old_value.is_none());
    assert_eq!(change.changes[0].new_value, Some(json!(null)));
    assert_eq!(change.changes[1].old_value, Some(json!("First")));
    assert_eq!(change.changes[1].new_value, Some(json!("Second")));
    let encoded = serde_json::to_value(change).unwrap();
    assert!(encoded["changes"][0].get("old_value").is_none());
    assert_eq!(
        serde_json::from_value::<HistoryEntry>(encoded).unwrap(),
        *change
    );
    let created = entries
        .iter()
        .find(|entry| entry.r#type == HistoryOperation::Create)
        .unwrap();
    assert_eq!(created.userid, "system");
    let mut invalid = serde_json::to_value(created).unwrap();
    invalid["userid"] = json!(null);
    assert!(serde_json::from_value::<HistoryEntry>(invalid.clone()).is_err());
    invalid.as_object_mut().unwrap().remove("userid");
    assert!(serde_json::from_value::<HistoryEntry>(invalid).is_err());
}

#[test]
fn insert_overwrites_and_repeated_ids_use_prior_working_state() {
    let mut store = setup();
    let id = ksuid::Ksuid::generate().to_base62();
    mutate(
        &mut store,
        vec![DataStoreMutationStep::Insert(DataStoreInsertMutation {
            table_name: TableName("tickets".into()),
            columns: vec![
                AttributeColumn {
                    attribute: AttributeName("id".into()),
                    values: Values::String(vec![id.clone().into(), id.clone().into()]),
                },
                AttributeColumn {
                    attribute: AttributeName("name".into()),
                    values: Values::String(vec!["First".into(), "Second".into()]),
                },
            ],
        })],
    )
    .unwrap();
    mutate(
        &mut store,
        vec![
            insert("tickets", &id, "Third"),
            insert("tickets", &id, "Third"),
        ],
    )
    .unwrap();
    let entries = store.history(request("tickets", &id)).unwrap().entries;
    assert_eq!(entries.len(), 3);
    assert!(entries.iter().any(|entry| {
        entry.changes.iter().any(|change| {
            change.old_value == Some(json!("Second")) && change.new_value == Some(json!("Third"))
        })
    }));
}

#[test]
fn pages_are_bounded_isolated_and_retained_after_deletion() {
    let mut store = setup();
    let id = ksuid::Ksuid::generate().to_base62();
    let other = ksuid::Ksuid::generate().to_base62();
    mutate(
        &mut store,
        vec![
            insert("tickets", &id, "A"),
            insert("projects", &id, "Project"),
            insert("tickets", &other, "Other"),
            insert("users", &id, "User"),
            update(&id, vec![column("name", "B")]),
            delete(&id),
        ],
    )
    .unwrap();
    let mut query = request("tickets", &id);
    query.limit = Some(1);
    let mut ids = Vec::new();
    loop {
        let page = store.history(query.clone()).unwrap();
        assert_eq!(page.entries.len(), 1);
        assert_eq!(page.entries[0].entity_id, id);
        ids.push(page.entries[0].id.clone());
        query.cursor = page.next_cursor;
        if query.cursor.is_none() {
            break;
        }
    }
    assert_eq!(ids.len(), 3);
    assert!(ids.windows(2).all(|pair| pair[0] > pair[1]));
    assert_eq!(
        store
            .history(request("projects", &id))
            .unwrap()
            .entries
            .len(),
        1
    );
    assert!(!store.history(request("users", &id)).unwrap().enabled);
    assert!(store.history(request("unknown", &id)).is_err());
    assert!(store.history(request("tickets", "bad:prefix")).is_err());
    let mut invalid_cursor = request("tickets", &id);
    invalid_cursor.cursor = Some("invalid:cursor".into());
    assert!(store.history(invalid_cursor).is_err());
    assert!(
        store
            .history(request("tickets", &ksuid::Ksuid::generate().to_base62()))
            .unwrap()
            .entries
            .is_empty()
    );
}

struct TestIndex {
    fail: Arc<AtomicBool>,
    indexed: Arc<Mutex<usize>>,
}
impl SearchIndex for TestIndex {
    fn prepare(&mut self, _: Vec<TableDescription>) -> JoiResult<()> {
        Ok(())
    }
    fn is_empty(&self, _: &TableName) -> JoiResult<bool> {
        Ok(false)
    }
    fn rebuild(&mut self, _: &TableName, _: &[Entity]) -> JoiResult<()> {
        Ok(())
    }
    fn upsert(&mut self, entities: &[Entity]) -> JoiResult<()> {
        if self.fail.load(Ordering::SeqCst) {
            joi_bail!("index failed");
        }
        *self.indexed.lock().unwrap() += entities.len();
        Ok(())
    }
    fn delete(&mut self, _: &TableName, _: &[EntityId]) -> JoiResult<()> {
        Ok(())
    }
    fn query_rows(&self, _: DataStoreQuery) -> JoiResult<DataStoreQueryResult> {
        joi_bail!("unused test query")
    }
    fn count(
        &self,
        _: &TableName,
        _: &QueryCriterion,
        _: Option<&AttributeName>,
        _: usize,
    ) -> JoiResult<Vec<DataStoreCountValue>> {
        joi_bail!("unused test count")
    }
}
struct TestKv {
    inner: RedbKeyValueStore,
    fail: bool,
    fail_cleanup: bool,
}
impl KeyValueStore for TestKv {
    fn mutate(&mut self, mutations: KeyValueMutations<'_>) -> JoiResult<()> {
        if self.fail_cleanup && mutations.mutations.iter().any(|mutation| matches!(mutation, KeyValueMutation::Remove(remove) if remove.table.0 == "dirty_tickets")) {
            joi_bail!("dirty cleanup failed");
        }
        if self.fail && mutations.mutations.iter().any(|mutation| matches!(mutation, KeyValueMutation::Set(set) if set.table.0 == "tickets")) { joi_bail!("KV commit failed"); }
        self.inner.mutate(mutations)
    }
    fn query_ids(&self, table: &TableName, ids: &[&[u8]]) -> JoiResult<Vec<KeyValue>> {
        self.inner.query_ids(table, ids)
    }
    fn query_range(
        &self,
        table: &TableName,
        range: std::ops::Range<&[u8]>,
    ) -> JoiResult<Vec<KeyValue>> {
        self.inner.query_range(table, range)
    }
    fn query_page(
        &self,
        table: &TableName,
        after: Option<&[u8]>,
        limit: usize,
    ) -> JoiResult<Vec<KeyValue>> {
        self.inner.query_page(table, after, limit)
    }
    fn query_oldest(&self, table: &TableName) -> JoiResult<Option<KeyValue>> {
        self.inner.query_oldest(table)
    }
    fn query_range_page(
        &self,
        table: &TableName,
        range: std::ops::Range<&[u8]>,
        before: Option<&[u8]>,
        limit: usize,
    ) -> JoiResult<Vec<KeyValue>> {
        self.inner.query_range_page(table, range, before, limit)
    }
}

#[test]
fn failures_obey_the_atomic_boundary_and_replay_does_not_duplicate_history() {
    for failure in ["contributor", "kv", "index", "cleanup"] {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("entities.redb");
        let indexed = Arc::new(Mutex::new(0));
        let index_failure = Arc::new(AtomicBool::new(failure == "index"));
        let mut store = IndexedDataStore::from_parts(
            Box::new(TestKv {
                inner: RedbKeyValueStore::open(&path).unwrap(),
                fail: failure == "kv",
                fail_cleanup: failure == "cleanup",
            }),
            Box::new(TestIndex {
                fail: index_failure.clone(),
                indexed: indexed.clone(),
            }),
        );
        store
            .set_contributors(registry(failure == "contributor"))
            .unwrap();
        store.ensure_tables(tables()).unwrap();
        let id = ksuid::Ksuid::generate().to_base62();
        assert!(mutate(&mut store, vec![insert("tickets", &id, "Original")]).is_err());
        assert_eq!(
            store
                .history(request("tickets", &id))
                .unwrap()
                .entries
                .len(),
            usize::from(matches!(failure, "index" | "cleanup"))
        );
        drop(store);
        let kv = RedbKeyValueStore::open(&path).unwrap();
        let committed = usize::from(matches!(failure, "index" | "cleanup"));
        assert_eq!(
            kv.query_ids(&TableName("tickets".into()), &[id.as_bytes()])
                .unwrap()
                .len(),
            committed
        );
        assert_eq!(
            kv.query_page(&TableName("dirty_tickets".into()), None, 10)
                .unwrap()
                .len(),
            committed
        );
        assert_eq!(
            kv.query_page(&history_table(&TableName("tickets".into())), None, 10)
                .unwrap()
                .len(),
            committed
        );
        index_failure.store(false, Ordering::SeqCst);
        let mut restarted = IndexedDataStore::from_parts(
            Box::new(kv),
            Box::new(TestIndex {
                fail: index_failure,
                indexed: indexed.clone(),
            }),
        );
        restarted.set_contributors(registry(false)).unwrap();
        restarted.ensure_tables(tables()).unwrap();
        restarted.ensure_tables(tables()).unwrap();
        assert_eq!(
            *indexed.lock().unwrap(),
            committed + usize::from(failure == "cleanup")
        );
        assert_eq!(
            restarted
                .history(request("tickets", &id))
                .unwrap()
                .entries
                .len(),
            committed
        );
    }
}

#[test]
fn contributor_namespaces_and_duplicate_keys_are_rejected() {
    let mut store = IndexedDataStore::in_memory().unwrap();
    store.set_contributors(registry(false)).unwrap();
    let mut schemas = tables();
    let mut collision = schemas[0].clone();
    collision.name = TableName("history_tickets".into());
    schemas.push(collision);
    assert!(store.ensure_tables(schemas).is_err());
    let table = TableName("owned".into());
    let mut entries = MutationEntries::new(vec![table.clone()]);
    let entry = KeyValue {
        key: vec![1],
        value: vec![],
    };
    entries.add(table.clone(), entry.clone()).unwrap();
    assert!(entries.add(table, entry.clone()).is_err());
    assert!(entries.add(TableName("tickets".into()), entry).is_err());

    let mut builder = PluginRegistryBuilder::new();
    builder
        .register(plugin("duplicate", "Duplicate owners", |context| {
            context
                .register_extension_point::<dyn MutationContributor>("mutations", "Mutations")?;
            for id in ["first", "second"] {
                context.register_extension::<dyn MutationContributor>(
                    id,
                    "History",
                    Box::new(HistoryContributor::new(vec![TableName("tickets".into())])),
                )?;
            }
            Ok(())
        }))
        .unwrap();
    let mut store = IndexedDataStore::in_memory().unwrap();
    store.set_contributors(builder.build()).unwrap();
    assert!(store.ensure_tables(tables()).is_err());
}

#[test]
fn commands_use_trusted_context_and_preserve_history_of_completed_chunks() {
    use crate::{
        command_handler::{CommandContext, CommandHandler},
        entity_history::EntityHistoryCommand,
        mutate_command::{MutateCommand, MutateRequest},
    };
    let store: SharedDataStore = Arc::new(Mutex::new(Box::new(setup())));
    let context = CommandContext {
        user: Some(CommandUser {
            id: "jane".into(),
            username: "jane.developer".into(),
        }),
    };
    let id = ksuid::Ksuid::generate().to_base62();
    let mutation: MutateRequest = serde_json::from_value(json!({ "steps": [{ "insert": {
        "table_name": "tickets", "columns": [
            {"attribute": "id", "values": {"type": "string", "values": [id]}},
            {"attribute": "name", "values": {"type": "string", "values": ["Created"]}},
        ],
    }}, {"update": {"table_name": "tickets", "ids": ["missing"], "columns": [{"attribute": "name", "values": {"type": "string", "values": ["Failed"]}}]}}] })).unwrap();
    assert!(
        MutateCommand::new(store.clone())
            .execute(&context, mutation)
            .is_err()
    );
    let command = EntityHistoryCommand::new(store);
    assert!(
        command
            .execute(&CommandContext::default(), request("tickets", &id))
            .is_err()
    );
    let entries = command
        .execute(&context, request("tickets", &id))
        .unwrap()
        .entries;
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].userid, "jane");
}

#[test]
#[ignore = "explicit full-size optimized history throughput check"]
fn full_chunk_history_throughput() {
    for tracked in [false, true] {
        let mut store = IndexedDataStore::in_memory().unwrap();
        if tracked {
            store.set_contributors(registry(false)).unwrap();
        }
        store.ensure_tables(tables()).unwrap();
        let ids = (0..50_000)
            .map(|_| ksuid::Ksuid::generate().to_base62().into())
            .collect::<Vec<joi_base::JoiString>>();
        let columns = vec![
            AttributeColumn {
                attribute: AttributeName("id".into()),
                values: Values::String(ids.clone()),
            },
            AttributeColumn {
                attribute: AttributeName("name".into()),
                values: Values::String(
                    (0..50_000)
                        .map(|index| {
                            format!("Review project permissions for ticket {index}").into()
                        })
                        .collect(),
                ),
            },
        ];
        let start = std::time::Instant::now();
        mutate(
            &mut store,
            vec![DataStoreMutationStep::Insert(DataStoreInsertMutation {
                table_name: TableName("tickets".into()),
                columns,
            })],
        )
        .unwrap();
        let insert = start.elapsed();
        let start = std::time::Instant::now();
        mutate(
            &mut store,
            vec![DataStoreMutationStep::Update(DataStoreUpdateMutation {
                table_name: TableName("tickets".into()),
                ids: ids.clone(),
                columns: vec![AttributeColumn {
                    attribute: AttributeName("name".into()),
                    values: Values::String(vec!["Updated project review".into(); ids.len()]),
                }],
            })],
        )
        .unwrap();
        println!(
            "50,000 rows: history={tracked}, insert={insert:?}, update={:?}",
            start.elapsed()
        );
        if tracked {
            assert_eq!(
                store
                    .history(request("tickets", &ids[0]))
                    .unwrap()
                    .entries
                    .len(),
                2
            );
            assert_eq!(
                store
                    .history(request("tickets", &ids[49_999]))
                    .unwrap()
                    .entries
                    .len(),
                2
            );
        }
    }
}
