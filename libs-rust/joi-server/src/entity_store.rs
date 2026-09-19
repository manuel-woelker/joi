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

/// One logical entity mutation operation used by the storage coordinator.
pub enum EntityMutationStep {
    /// Creates an entity and fails when its key already exists.
    Create(Entity),
    /// Replaces an existing entity and fails when its key does not exist.
    Update(Entity),
    /// Deletes an existing entity and fails when its key does not exist.
    Delete(EntityKey),
}

use crate::data_store::TableName;
