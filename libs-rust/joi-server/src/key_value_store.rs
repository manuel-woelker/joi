use std::{ops::Range, sync::Arc};

use joi_error::JoiResult;

use crate::data_store::TableName;

/// A key/value entry returned by a store query.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct KeyValue {
    /// Binary key.
    pub key: Vec<u8>,
    /// Binary value.
    pub value: Vec<u8>,
}

/// A group of operations committed atomically.
pub struct KeyValueMutations<'a> {
    /// Operations applied in declaration order.
    pub mutations: &'a Vec<KeyValueMutation>,
}

/// One atomic key/value operation.
pub enum KeyValueMutation {
    /// Inserts or replaces entries.
    Set(KeyValueSetMutation),
    /// Removes keys.
    Remove(KeyValueRemoveMutation),
}

/// Entries to insert in one table.
pub struct KeyValueSetMutation {
    /// Destination table.
    pub table: TableName,
    /// Entries to write.
    pub entries: Vec<KeyValue>,
}

/// Keys to remove from one table.
pub struct KeyValueRemoveMutation {
    /// Destination table.
    pub table: TableName,
    /// Keys to remove.
    pub keys: Vec<Vec<u8>>,
}

/// Transactional binary key/value storage.
///
/// Tables are logical namespaces and keys and values are opaque bytes. Keeping
/// this contract model-independent allows the same backend to store entities
/// and durable work queues. A mutation commits all its operations atomically,
/// which lets the storage layer write entity data and index bookkeeping in one
/// transaction.
pub trait KeyValueStore: Send {
    /// Applies all operations atomically.
    fn mutate(&mut self, mutations: KeyValueMutations<'_>) -> JoiResult<()>;

    /// Looks up keys, returning only entries that exist.
    fn query_ids(&self, table: &TableName, ids: &[&[u8]]) -> JoiResult<Vec<KeyValue>>;

    /// Returns entries whose keys fall within `range`, in key order.
    fn query_range(&self, table: &TableName, range: Range<&[u8]>) -> JoiResult<Vec<KeyValue>>;

    /// Returns up to `limit` entries with keys strictly after `after`, in key order.
    ///
    /// A `None` cursor starts at the beginning. The open-ended scan lets
    /// callers page through a table without loading it into memory.
    fn query_page(
        &self,
        table: &TableName,
        after: Option<&[u8]>,
        limit: usize,
    ) -> JoiResult<Vec<KeyValue>>;

    /// Returns the oldest entry in `table`, i.e. the one with the smallest key.
    fn query_oldest(&self, table: &TableName) -> JoiResult<Option<KeyValue>>;
}

/// A shareable key/value store handle.
pub type SharedKeyValueStore = Arc<std::sync::Mutex<Box<dyn KeyValueStore>>>;
