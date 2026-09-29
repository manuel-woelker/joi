use joi_plugin::{PluginRegistry, PluginRegistryBuilder, plugin};
use joi_server::{
    command_handler::{CommandHandler, CommandUser},
    command_registry::{CommandProvider, CommandRegistryBuilder},
    data_store::*,
    generated::api::{ModelAttributeType, ModelInfoRequest},
    model_info_command::ModelInfoCommand,
    mutation_contributor::{MutationContext, MutationContributor},
    storage::IndexedDataStore,
    user_session_command::UserTableDescriptionProvider,
};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};

fn registry() -> PluginRegistry {
    let mut builder = PluginRegistryBuilder::new();
    builder
        .register(plugin("base", "Test host", |context| {
            context.register_extension_point::<dyn TableDescriptionProvider>("tables", "Tables")?;
            context
                .register_extension_point::<dyn MutationContributor>("mutations", "Mutations")?;
            context.register_extension_point::<dyn CommandProvider>("commands", "Commands")?;
            context.register_extension::<dyn TableDescriptionProvider>(
                "users",
                "Users",
                Box::new(UserTableDescriptionProvider),
            )
        }))
        .unwrap();
    builder.register(super::wiki_plugin()).unwrap();
    builder.build()
}

fn prepare(store: &mut IndexedDataStore) {
    let registry = registry();
    let schemas = registry
        .extensions::<dyn TableDescriptionProvider>()
        .unwrap()
        .map(TableDescriptionProvider::table_description)
        .collect();
    store.set_contributors(registry).unwrap();
    store.ensure_tables(schemas).unwrap();
}

fn user(id: &str) -> MutationContext {
    MutationContext::for_user(Some(&CommandUser {
        id: id.into(),
        username: id.into(),
    }))
}

fn strings(attribute: &str, values: &[&str]) -> AttributeColumn {
    AttributeColumn {
        attribute: AttributeName(attribute.into()),
        values: Values::String(values.iter().map(|s| (*s).into()).collect()),
    }
}

fn insert(id: &str, title: &str) -> DataStoreMutationStep {
    DataStoreMutationStep::Insert(DataStoreInsertMutation {
        table_name: TableName("wikipages".into()),
        columns: vec![
            strings("id", &[id]),
            strings("title", &[title]),
            strings("content", &["<p>Hello wiki</p>"]),
        ],
    })
}

fn update(id: &str, title: &str) -> DataStoreMutationStep {
    DataStoreMutationStep::Update(DataStoreUpdateMutation {
        table_name: TableName("wikipages".into()),
        ids: vec![id.into()],
        columns: vec![strings("title", &[title])],
    })
}

fn mutate(
    store: &mut IndexedDataStore,
    context: &MutationContext,
    steps: Vec<DataStoreMutationStep>,
) -> Vec<Value> {
    store
        .mutate(
            context,
            DataStoreMutation {
                steps,
                return_entities: true,
            },
        )
        .unwrap()
        .entities
        .unwrap()
        .into_iter()
        .map(|entity| serde_json::from_slice(&entity.data).unwrap())
        .collect()
}

#[test]
fn attributes_real_changes_to_authenticated_users_and_preserves_creator() {
    let mut store = IndexedDataStore::in_memory().unwrap();
    prepare(&mut store);
    let created = &mutate(&mut store, &user("jane"), vec![insert("page-1", "Welcome")])[0];
    assert_eq!(created["creator"], "jane");
    assert_eq!(created["authors"], json!(["jane"]));
    assert_eq!(created["creation_date"], created["update_date"]);
    let changed = &mutate(
        &mut store,
        &user("joe"),
        vec![update("page-1", "Welcome back")],
    )[0];
    assert_eq!(changed["creator"], "jane");
    assert_eq!(changed["authors"], json!(["jane", "joe"]));
    assert_eq!(changed["creation_date"], created["creation_date"]);
    let noop = &mutate(
        &mut store,
        &user("outsider"),
        vec![update("page-1", "Welcome back")],
    )[0];
    assert_eq!(noop, changed);
    let again = &mutate(
        &mut store,
        &user("joe"),
        vec![update("page-1", "New heading")],
    )[0];
    assert_eq!(again["authors"], json!(["jane", "joe"]));
    let replaced = &mutate(
        &mut store,
        &user("marla"),
        vec![insert("page-1", "Replacement")],
    )[0];
    assert_eq!(replaced["creator"], "jane");
    assert_eq!(replaced["authors"], json!(["jane", "joe", "marla"]));
    assert_eq!(replaced["creation_date"], created["creation_date"]);
    let system = &mutate(
        &mut store,
        &MutationContext::system(),
        vec![insert("page-2", "Automated")],
    )[0];
    assert_eq!(system["creator"], "system");
    assert_eq!(system["authors"], json!(["system"]));
}

#[test]
fn attribution_cannot_be_spoofed_and_empty_titles_are_rejected() {
    let mut store = IndexedDataStore::in_memory().unwrap();
    prepare(&mut store);
    mutate(&mut store, &user("jane"), vec![insert("page-1", "Welcome")]);
    for column in [
        strings("creator", &["spoof"]),
        AttributeColumn {
            attribute: AttributeName("authors".into()),
            values: Values::ReferenceList(vec![vec!["spoof".into()]]),
        },
        strings("title", &[" "]),
    ] {
        let result = store.mutate(
            &user("joe"),
            DataStoreMutation {
                return_entities: false,
                steps: vec![DataStoreMutationStep::Update(DataStoreUpdateMutation {
                    table_name: TableName("wikipages".into()),
                    ids: vec!["page-1".into()],
                    columns: vec![column],
                })],
            },
        );
        assert!(result.is_err());
    }
    let original = &mutate(&mut store, &user("jane"), vec![update("page-1", "Welcome")])[0];
    assert_eq!(original["authors"], json!(["jane"]));
}

#[test]
fn metadata_describes_reference_lists_and_rich_text_from_the_server() {
    let response = ModelInfoCommand::new(registry())
        .execute(&Default::default(), ModelInfoRequest {})
        .unwrap();
    let page = response
        .models
        .iter()
        .find(|model| model.name == "wikipages")
        .unwrap();
    let authors = page
        .attributes
        .iter()
        .find(|column| column.name == "authors")
        .unwrap();
    assert_eq!(authors.data_type, ModelAttributeType::ReferenceList);
    assert_eq!(authors.references.as_ref().unwrap().model, "users");
    let presentation = page.presentation.as_ref().unwrap();
    assert_eq!(presentation.label_template, "${title}");
    assert_eq!(presentation.icon, "book-open");
    let content = presentation
        .fields
        .iter()
        .find(|field| field.attribute == "content")
        .unwrap();
    assert_eq!(
        content.control,
        joi_server::generated::api::ModelControl::Html
    );
    assert!(content.creatable && content.editable);
}

#[test]
fn attribution_survives_reopening_on_disk() {
    let dir = tempfile::tempdir().unwrap();
    let open = || {
        let mut store =
            IndexedDataStore::open(dir.path().join("wiki.redb"), dir.path().join("search"))
                .unwrap();
        prepare(&mut store);
        store
    };
    {
        let mut store = open();
        mutate(&mut store, &user("jane"), vec![insert("page-1", "Welcome")]);
    }
    let mut store = open();
    let updated = &mutate(&mut store, &user("joe"), vec![update("page-1", "Changed")])[0];
    assert_eq!(updated["creator"], "jane");
    assert_eq!(updated["authors"], json!(["jane", "joe"]));
}

#[test]
fn drafts_remain_unpublished_until_explicit_publish() {
    let mut store = IndexedDataStore::in_memory().unwrap();
    prepare(&mut store);
    mutate(
        &mut store,
        &user("jane"),
        vec![insert("page-1", "Published")],
    );
    let store: SharedDataStore = Arc::new(Mutex::new(Box::new(store)));
    let mut builder = CommandRegistryBuilder::new();
    super::draft_commands::WikiDraftCommandProvider
        .register_commands(&mut builder, store.clone())
        .unwrap();
    let commands = builder.build();
    let context = joi_server::command_handler::CommandContext {
        user: Some(CommandUser {
            id: "joe".into(),
            username: "joe".into(),
        }),
    };
    let read = || {
        commands
            .execute(
                &context,
                "wiki-draft",
                json!({"id":"page-1","create":false}),
            )
            .unwrap()
            .unwrap()
    };
    assert_eq!(read()["exists"], false);
    commands
        .execute(&context, "wiki-draft", json!({"id":"page-1","create":true}))
        .unwrap()
        .unwrap();
    store
        .lock()
        .unwrap()
        .mutate(
            &user("joe"),
            DataStoreMutation {
                steps: vec![DataStoreMutationStep::Update(DataStoreUpdateMutation {
                    table_name: TableName("wikipage_drafts".into()),
                    ids: vec!["page-1".into()],
                    columns: vec![
                        strings("title", &["Draft title"]),
                        strings("content", &["<p>Draft body</p>"]),
                    ],
                })],
                return_entities: false,
            },
        )
        .unwrap();
    assert_eq!(read()["title"], "Draft title");
    assert_eq!(read()["content"], "<p>Draft body</p>");
    assert_eq!(read()["exists"], true);
    let published = store
        .lock()
        .unwrap()
        .query(DataStoreQuery {
            table_name: TableName("wikipages".into()),
            criterion: QueryCriterion::Equals {
                attribute: AttributeName("id".into()),
                values: vec!["page-1".into()],
            },
            sorting: vec![],
            max_results: 1,
            attributes: vec![
                AttributeName("title".into()),
                AttributeName("authors".into()),
            ],
        })
        .unwrap();
    assert!(
        matches!(&published.result_columns[0].values, Values::String(values) if values[0] == "Published")
    );
    assert!(
        matches!(&published.result_columns[1].values, Values::ReferenceList(values) if values[0].iter().map(ToString::to_string).collect::<Vec<_>>() == vec!["jane".to_string()])
    );
    let result = commands
        .execute(&context, "wiki-publish", json!({"id":"page-1"}))
        .unwrap()
        .unwrap();
    assert_eq!(result["title"], "Draft title");
    assert_eq!(result["content"], "<p>Draft body</p>");
    assert_eq!(read()["exists"], false);
    let published = store
        .lock()
        .unwrap()
        .query(DataStoreQuery {
            table_name: TableName("wikipages".into()),
            criterion: QueryCriterion::MatchAny,
            sorting: vec![],
            max_results: 1,
            attributes: vec![
                AttributeName("title".into()),
                AttributeName("content".into()),
                AttributeName("authors".into()),
            ],
        })
        .unwrap();
    assert!(
        matches!(&published.result_columns[0].values, Values::String(values) if values[0] == "Draft title")
    );
    assert!(
        matches!(&published.result_columns[1].values, Values::String(values) if values[0] == "<p>Draft body</p>")
    );
    assert!(
        matches!(&published.result_columns[2].values, Values::ReferenceList(values) if values[0].iter().map(ToString::to_string).collect::<Vec<_>>() == vec!["jane".to_string(), "joe".to_string()])
    );
}
