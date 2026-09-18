use joi_error::JoiResult;

use crate::data_store::TableName;

/// Opaque binary identifier used by primary entity storage.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct EntityId(pub Vec<u8>);

impl EntityId {
    /// Creates an identifier from arbitrary bytes.
    pub fn new(value: impl Into<Vec<u8>>) -> Self {
        Self(value.into())
    }

    /// Returns the identifier bytes.
    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }
}

/// One complete, opaque entity stored under a type and binary identifier.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entity {
    /// Logical entity type.
    pub entity_type: TableName,
    /// Identifier unique within the entity type.
    pub id: EntityId,
    /// Application-owned binary representation of the complete entity.
    pub data: Vec<u8>,
}

/// Identifies an entity without carrying its value.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EntityKey {
    /// Logical entity type.
    pub entity_type: TableName,
    /// Identifier unique within the entity type.
    pub id: EntityId,
}

/// One atomic entity-store mutation operation.
pub enum EntityMutationStep {
    /// Creates an entity and fails when its key already exists.
    Create(Entity),
    /// Replaces an existing entity and fails when its key does not exist.
    Update(Entity),
    /// Deletes an existing entity and fails when its key does not exist.
    Delete(EntityKey),
}

/// A batch of operations committed atomically by an [`EntityStore`].
pub struct EntityMutation {
    /// Operations applied in declaration order.
    pub steps: Vec<EntityMutationStep>,
    /// Whether complete created and updated entities should be returned.
    pub return_entities: bool,
}

/// Result of an atomic entity mutation.
pub struct EntityMutationResult {
    /// Complete created and updated entities when requested.
    pub entities: Option<Vec<Entity>>,
    /// Dirty queue entries written by this mutation transaction.
    pub dirty_batches: Vec<DirtyBatch>,
}

/// A durable search-index work item written alongside entity mutations.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DirtyBatch {
    /// Entity type whose search index needs updating.
    pub entity_type: TableName,
    /// Monotonic queue sequence for this entity type.
    pub sequence: u64,
    /// Entity IDs affected by the mutation.
    pub ids: Vec<EntityId>,
}

/// Primary storage for opaque entities.
pub trait EntityStore: Send {
    /// Creates the durable dirty queue for each entity type.
    fn prepare_dirty_tables(&mut self, entity_types: &[TableName]) -> JoiResult<()>;

    /// Creates an entity, failing if its key already exists.
    fn create(&mut self, entity: Entity) -> JoiResult<()>;

    /// Reads an entity by type and binary identifier.
    fn read(&self, entity_type: &TableName, id: &EntityId) -> JoiResult<Option<Entity>>;

    /// Replaces an entity, failing if its key does not exist.
    fn update(&mut self, entity: Entity) -> JoiResult<()>;

    /// Deletes an entity, failing if its key does not exist.
    fn delete(&mut self, entity_type: &TableName, id: &EntityId) -> JoiResult<()>;

    /// Returns all entities of one type for index reconstruction.
    fn read_all(&self, entity_type: &TableName) -> JoiResult<Vec<Entity>>;

    /// Returns the requested entities that currently exist.
    fn read_many(&self, entity_type: &TableName, ids: &[EntityId]) -> JoiResult<Vec<Entity>>;

    /// Returns the oldest dirty queue entries up to the supplied ID count.
    fn read_dirty_batches(
        &self,
        entity_type: &TableName,
        max_ids: usize,
    ) -> JoiResult<Vec<DirtyBatch>>;

    /// Removes exactly the dirty queue entries that were indexed successfully.
    fn clear_dirty_batches(&mut self, batches: &[DirtyBatch]) -> JoiResult<()>;

    /// Applies several operations atomically.
    fn mutate(&mut self, mutation: EntityMutation) -> JoiResult<EntityMutationResult>;
}
