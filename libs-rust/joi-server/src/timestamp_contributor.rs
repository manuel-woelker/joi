use joi_error::{JoiResult, joi_bail};
use serde_json::Value;

use crate::{
    data_store::{AttributeName, ColumnDataType, TableDescription},
    mutation_contributor::{
        ChunkMutationContributor, ConfiguredMutationContributor, ContributionChunk,
        ContributionOrder, MutationContext, MutationContributor, MutationEntries, MutationKind,
        MutationPreparation,
    },
};

/// Binds automatic timestamp columns once when schemas are registered.
pub struct TimestampContributor;

impl MutationContributor for TimestampContributor {
    fn configure(
        &self,
        schema: &TableDescription,
    ) -> JoiResult<Option<ConfiguredMutationContributor>> {
        let columns = schema
            .columns
            .iter()
            .filter(|column| matches!(column.name.0.as_str(), "creation_date" | "update_date"))
            .collect::<Vec<_>>();
        if columns.is_empty() {
            return Ok(None);
        }
        if columns
            .iter()
            .any(|column| column.data_type != ColumnDataType::String)
        {
            joi_bail!("timestamp columns must have string type");
        }
        let attributes = columns
            .iter()
            .map(|column| column.name.clone())
            .collect::<Vec<_>>();
        Ok(Some(ConfiguredMutationContributor {
            generated_attributes: attributes.clone(),
            buckets: vec![],
            order: ContributionOrder::Metadata,
            handler: Box::new(TimestampColumns(
                attributes
                    .into_iter()
                    .map(|attribute| {
                        let creation = attribute.0 == "creation_date";
                        (attribute, creation)
                    })
                    .collect(),
            )),
        }))
    }
}

struct TimestampColumns(Vec<(AttributeName, bool)>);

impl ChunkMutationContributor for TimestampColumns {
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
        // Snapshot once: adding creation_date must not turn a no-op into an update.
        let changed = chunk
            .rows()
            .iter()
            .map(|row| row.is_changed())
            .collect::<Vec<_>>();
        for (attribute, creation) in &self.0 {
            let values = chunk
                .rows()
                .iter()
                .zip(&changed)
                .map(|(row, changed)| {
                    (*changed && (!creation || row.old_value.is_none()))
                        .then(|| Value::String(context.timestamp().into()))
                })
                .collect();
            chunk.add_column(attribute.clone(), values)?;
        }
        Ok(())
    }
}
