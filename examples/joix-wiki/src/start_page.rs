use joi_error::{JoiResult, joi_bail};
use joi_server::{
    data_store::{
        AttributeColumn, AttributeName, DataStore, DataStoreInsertMutation, DataStoreMutation,
        DataStoreMutationStep, DataStoreQuery, QueryCriterion, StartupDataProvider, TableName,
        Values,
    },
    entity_keys::{EntityKey, find_entity_key, register_entity_key},
    mutation_contributor::MutationContext,
};

/// Ensures every installation has a stable wiki entry point.
pub struct StartPageInitializer;

impl StartupDataProvider for StartPageInitializer {
    fn initialize(&self, store: &mut dyn DataStore) -> JoiResult<()> {
        let existing = find_entity_key(store, "wiki", "Start")?;
        if let Some(entry) = &existing
            && entry.entity_type != "wikipages"
        {
            joi_bail!("wiki:Start must point to a wiki page");
        }
        let id = existing
            .as_ref()
            .map(|entry| entry.entity_id.clone())
            .unwrap_or_else(|| ksuid::Ksuid::generate().to_base62().into());
        let pages = store.query(DataStoreQuery {
            table_name: TableName("wikipages".into()),
            criterion: QueryCriterion::Equals {
                attribute: AttributeName("id".into()),
                values: vec![id.clone()],
            },
            sorting: vec![],
            max_results: 1,
            attributes: vec![AttributeName("id".into())],
        })?;
        if pages.number_of_hits == 0 {
            store.mutate(
                &MutationContext::system(),
                DataStoreMutation {
                    steps: vec![DataStoreMutationStep::Insert(DataStoreInsertMutation {
                        table_name: TableName("wikipages".into()),
                        columns: [
                            ("id", id.as_str()),
                            ("title", "Start"),
                            ("content", "<p>Welcome to the wiki.</p>"),
                        ]
                        .map(|(name, value)| AttributeColumn {
                            attribute: AttributeName(name.into()),
                            values: Values::String(vec![value.into()]),
                        })
                        .into_iter()
                        .collect(),
                    })],
                    return_entities: false,
                },
            )?;
        }
        register_entity_key(
            store,
            &EntityKey {
                namespace: "wiki".into(),
                key: "Start".into(),
                entity_type: "wikipages".into(),
                entity_id: id,
            },
        )
    }
}
