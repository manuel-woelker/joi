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
