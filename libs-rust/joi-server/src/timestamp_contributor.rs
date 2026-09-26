use joi_error::JoiResult;
use serde_json::Value;

use crate::{
    data_store::{AttributeName, TableDescription, TableName},
    mutation_contributor::{EntityMutation, MutationContext, MutationContributor, MutationEntries},
};

/// Built-in contributor for schemas declaring `creation_date` or `update_date`.
/// Runs after history collection, so automatic metadata does not clutter history.
pub struct TimestampContributor;

impl MutationContributor for TimestampContributor {
    fn applies_to(&self, _: &TableName) -> bool {
        true
    }
    fn buckets(&self) -> Vec<TableName> {
        Vec::new()
    }
    fn generated_attributes(&self, table: &TableDescription) -> Vec<AttributeName> {
        table
            .columns
            .iter()
            .filter(|column| matches!(column.name.0.as_str(), "creation_date" | "update_date"))
            .map(|column| column.name.clone())
            .collect()
    }
    fn contribute(
        &self,
        _: &MutationContext,
        _: &[EntityMutation],
        _: &mut MutationEntries,
    ) -> JoiResult<()> {
        Ok(())
    }
    fn finalize(
        &self,
        context: &MutationContext,
        schema: &TableDescription,
        mutation: &mut EntityMutation,
    ) -> JoiResult<()> {
        let Some(value) = &mut mutation.new_value else {
            return Ok(());
        };
        for attribute in self.generated_attributes(schema) {
            if attribute.0 == "update_date" || mutation.old_value.is_none() {
                value.insert(
                    attribute.0.to_string(),
                    Value::String(context.timestamp().into()),
                );
            } else if let Some(previous) = mutation
                .old_value
                .as_ref()
                .and_then(|old| old.get("creation_date"))
            {
                value.insert("creation_date".into(), previous.clone());
            }
        }
        Ok(())
    }
}
