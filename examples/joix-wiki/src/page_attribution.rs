use joi_error::{JoiResult, joi_error};
use joi_server::{
    data_store::{AttributeName, TableDescription},
    mutation_contributor::{
        ChunkMutationContributor, ConfiguredMutationContributor, ContributionChunk,
        ContributionOrder, MutationContext, MutationContributor, MutationEntries, MutationKind,
        MutationPreparation,
    },
};
use serde_json::{Value, json};

pub(crate) struct PageAttribution;

impl MutationContributor for PageAttribution {
    fn configure(
        &self,
        schema: &TableDescription,
    ) -> JoiResult<Option<ConfiguredMutationContributor>> {
        Ok(
            (schema.name.0 == "wikipages").then(|| ConfiguredMutationContributor {
                generated_attributes: vec![
                    AttributeName("creator".into()),
                    AttributeName("authors".into()),
                ],
                buckets: vec![],
                order: ContributionOrder::Domain,
                handler: Box::new(Self),
            }),
        )
    }
}

impl ChunkMutationContributor for PageAttribution {
    fn contribute(
        &self,
        context: &MutationContext,
        chunk: &mut ContributionChunk,
        _: &mut MutationEntries,
        _: &mut MutationPreparation<'_>,
    ) -> JoiResult<()> {
        if chunk.kind == MutationKind::Delete {
            return Ok(());
        }
        let mut creators = Vec::new();
        let mut authors = Vec::new();
        // Track repeated IDs within an insert chunk as well as persisted previous states.
        let mut previous = std::collections::HashMap::<_, (Value, Value)>::new();
        for row in chunk.rows() {
            let repeated = previous.get(&row.entity_id);
            let old = row.old_value.as_ref();
            let creator = repeated
                .map(|(creator, _)| creator)
                .or_else(|| old.and_then(|value| value.get("creator")))
                .cloned()
                .unwrap_or_else(|| json!(context.userid()));
            let mut ids = match repeated
                .map(|(_, authors)| authors)
                .or_else(|| old.and_then(|value| value.get("authors")))
            {
                Some(value) => value
                    .as_array()
                    .cloned()
                    .ok_or_else(|| joi_error!("invalid stored page authors"))?,
                None => vec![],
            };
            // Only business changes count as a contribution. No-op writes do not add authors.
            let changed = old.is_none_or(|old| {
                ["title", "content"].iter().any(|key| {
                    old.get(*key) != row.new_value.as_ref().and_then(|new| new.get(*key))
                })
            });
            let user = json!(context.userid());
            if changed && !ids.contains(&user) {
                ids.push(user);
            }
            let ids = Value::Array(ids);
            if chunk.kind == MutationKind::Insert {
                previous.insert(row.entity_id.clone(), (creator.clone(), ids.clone()));
            }
            creators.push(Some(creator));
            authors.push(Some(ids));
        }
        chunk.add_column(AttributeName("creator".into()), creators)?;
        chunk.add_column(AttributeName("authors".into()), authors)
    }
}
