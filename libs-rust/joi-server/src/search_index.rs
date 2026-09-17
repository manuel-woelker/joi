use joi_error::JoiResult;

use crate::{
    data_store::{
        AttributeName, DataStoreCountValue, DataStoreQuery, DataStoreQueryResult, QueryCriterion,
        TableDescription, TableName,
    },
    entity_store::{Entity, EntityId},
};

/// Secondary index responsible for all entity queries and aggregations.
pub trait SearchIndex: Send {
    /// Creates searchable schemas for the supplied entity types.
    fn prepare(&mut self, tables: Vec<TableDescription>) -> JoiResult<()>;

    /// Replaces the complete index contents for one entity type.
    fn rebuild(&mut self, entity_type: &TableName, entities: &[Entity]) -> JoiResult<()>;

    /// Inserts or replaces complete entities in the index.
    fn upsert(&mut self, entities: &[Entity]) -> JoiResult<()>;

    /// Removes entities from the index.
    fn delete(&mut self, entity_type: &TableName, ids: &[EntityId]) -> JoiResult<()>;

    /// Returns matching rows from the index.
    fn query_rows(&self, query: DataStoreQuery) -> JoiResult<DataStoreQueryResult>;

    /// Counts matching entities, optionally grouping by an attribute.
    fn count(
        &self,
        entity_type: &TableName,
        criterion: &QueryCriterion,
        attribute: Option<&AttributeName>,
        max_results: usize,
    ) -> JoiResult<Vec<DataStoreCountValue>>;
}
