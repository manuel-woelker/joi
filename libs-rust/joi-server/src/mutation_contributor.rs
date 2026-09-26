use std::collections::{BTreeSet, HashMap, HashSet};

use joi_base::JoiString;
use joi_error::{JoiResult, joi_bail, report};
use serde_json::{Map, Value};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

use crate::{
    command_handler::CommandUser,
    data_store::{AttributeName, TableDescription, TableName},
    generated::api::{HistoryChange, HistoryOperation},
    key_value_store::{KeyValue, KeyValueMutation, KeyValueSetMutation, KeyValueStore},
};

/// Identity of server-initiated writes. Never assign it to a real user account.
pub const SYSTEM_USER_ID: &str = "system";

/// Immutable attribution for one mutation invocation, independent of transport.
pub struct MutationContext {
    user: Option<CommandUser>,
    timestamp: String,
}

impl MutationContext {
    /// Creates a context for startup, maintenance, or anonymous CLI work.
    pub fn system() -> Self {
        Self::for_user(None)
    }

    /// Derives attribution from trusted command context, not client request data.
    pub fn for_user(user: Option<&CommandUser>) -> Self {
        Self {
            user: user.cloned(),
            timestamp: OffsetDateTime::now_utc()
                .format(&Rfc3339)
                .expect("UTC timestamp formats"),
        }
    }

    /// Non-null ID written to history, including the reserved system identity.
    pub fn userid(&self) -> &str {
        self.user
            .as_ref()
            .map_or(SYSTEM_USER_ID, |user| user.id.as_str())
    }

    /// Authenticated user details, absent for system work.
    pub fn user(&self) -> Option<&CommandUser> {
        self.user.as_ref()
    }

    /// UTC RFC 3339 mutation timestamp.
    pub fn timestamp(&self) -> &str {
        &self.timestamp
    }
}

/// An actual entity change prepared before the transaction is committed.
pub struct EntityMutation {
    /// Entity namespace.
    pub table: TableName,
    /// Record identity.
    pub entity_id: JoiString,
    /// Actual operation, including insert-overwrite becoming Update.
    pub operation: HistoryOperation,
    /// Complete previous attributes, absent for creation.
    pub old_value: Option<Map<String, Value>>,
    /// Complete attributes at the current contribution phase, absent for deletion.
    pub new_value: Option<Map<String, Value>>,
    /// Sorted business changes before finalization adds automatic metadata.
    pub changes: Vec<HistoryChange>,
}

impl EntityMutation {
    /// Computes a presence-aware diff, omitting nonexistent deletes and equal updates.
    pub fn between(
        table: &TableName,
        id: &str,
        old_value: Option<Map<String, Value>>,
        new_value: Option<Map<String, Value>>,
    ) -> Option<Self> {
        if old_value == new_value {
            return None;
        }
        let keys = old_value
            .iter()
            .chain(new_value.iter())
            .flat_map(|map| map.keys())
            .collect::<BTreeSet<_>>();
        let changes = keys
            .into_iter()
            .filter_map(|key| {
                let old = old_value.as_ref().and_then(|map| map.get(key));
                let new = new_value.as_ref().and_then(|map| map.get(key));
                (old != new).then(|| HistoryChange {
                    key: key.clone(),
                    old_value: old.cloned(),
                    new_value: new.cloned(),
                })
            })
            .collect();
        let operation = if old_value.is_none() {
            HistoryOperation::Create
        } else if new_value.is_none() {
            HistoryOperation::Delete
        } else {
            HistoryOperation::Update
        };
        Some(Self {
            table: table.clone(),
            entity_id: id.into(),
            operation,
            old_value,
            new_value,
            changes,
        })
    }
}

/// Additional writes restricted to the current contributor's owned buckets.
pub struct MutationEntries {
    allowed: HashSet<TableName>,
    entries: HashMap<TableName, Vec<KeyValue>>,
    keys: HashSet<(TableName, Vec<u8>)>,
}

impl MutationEntries {
    pub(crate) fn new(tables: Vec<TableName>) -> Self {
        Self {
            allowed: tables.into_iter().collect(),
            entries: HashMap::new(),
            keys: HashSet::new(),
        }
    }

    /// Adds one new auxiliary entry; repeated keys and undeclared buckets fail.
    pub fn add(&mut self, table: TableName, entry: KeyValue) -> JoiResult<()> {
        if !self.allowed.contains(&table) {
            joi_bail!("contributor does not own bucket `{}`", table.0);
        }
        if !self.keys.insert((table.clone(), entry.key.clone())) {
            joi_bail!("duplicate contributor key in `{}`", table.0);
        }
        self.entries.entry(table).or_default().push(entry);
        Ok(())
    }

    /// Serializes a value as JSON into an owned auxiliary bucket.
    pub fn add_json(
        &mut self,
        table: TableName,
        key: Vec<u8>,
        value: &impl serde::Serialize,
    ) -> JoiResult<()> {
        self.add(
            table,
            KeyValue {
                key,
                value: serde_json::to_vec(value).map_err(report)?,
            },
        )
    }

    pub(crate) fn into_mutations(self) -> Vec<KeyValueMutation> {
        self.entries
            .into_iter()
            .map(|(table, entries)| KeyValueMutation::Set(KeyValueSetMutation { table, entries }))
            .collect()
    }
}

/// Pre-commit extension contributing durable entries to an entity transaction.
///
/// Implementations must not perform external side effects or recursively call
/// the datastore. Failure aborts the current chunk, not earlier committed chunks.
pub trait MutationContributor: Send + Sync {
    /// Binds once per table during schema registration; return None for unrelated tables.
    fn configure(
        &self,
        schema: &TableDescription,
    ) -> JoiResult<Option<ConfiguredMutationContributor>>;
    /// Whether this contributor supplies the standard entity history contract.
    fn provides_history(&self, _table: &TableName) -> bool {
        false
    }
}

/// Stable execution order, independent of plugin registration order.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord)]
pub enum ContributionOrder {
    /// Business fields, such as generated ticket keys.
    #[default]
    Domain,
    /// Audit the business changes before automatic metadata is added.
    History,
    /// Automatic timestamps and other non-audited metadata.
    Metadata,
}

/// Cached table-specific contributor, including its write permissions.
pub struct ConfiguredMutationContributor {
    /// Server-owned fields, protected from client writes.
    pub generated_attributes: Vec<AttributeName>,
    /// Exclusively owned auxiliary buckets.
    pub buckets: Vec<TableName>,
    /// Contributors with equal order retain registration order.
    pub order: ContributionOrder,
    /// Handler bound to this table's schema.
    pub handler: Box<dyn ChunkMutationContributor>,
}

/// One callback per chunk; no separate insert/finalization phases.
pub trait ChunkMutationContributor: Send + Sync {
    /// Adds columns and/or transactional auxiliary writes. Never perform external side effects.
    fn contribute(
        &self,
        context: &MutationContext,
        chunk: &mut ContributionChunk,
        entries: &mut MutationEntries,
        preparation: &mut MutationPreparation<'_>,
    ) -> JoiResult<()>;
}

/// Original mutation operation shared by all rows in a chunk.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MutationKind {
    /// Creates rows or replaces existing rows.
    Insert,
    /// Patches existing rows.
    Update,
    /// Removes rows.
    Delete,
}

/// One row's immutable prior state and current, not-yet-serialized state.
pub struct MutationRow {
    /// Immutable identity of this row.
    pub entity_id: JoiString,
    /// Stored state before this chunk; None for new or nonexistent records.
    pub old_value: Option<Map<String, Value>>,
    /// Current state including earlier contributions; None for deletes.
    pub new_value: Option<Map<String, Value>>,
}

impl MutationRow {
    /// Whether the row currently differs from its stored state.
    pub fn is_changed(&self) -> bool {
        self.old_value != self.new_value
    }
}

/// Mutable column-oriented contribution interface over a single-table chunk.
/// Row order and identity never change. Later contributors see earlier columns.
pub struct ContributionChunk {
    /// Table being mutated.
    pub table: TableName,
    /// Insert, update, or delete request.
    pub kind: MutationKind,
    pub(crate) rows: Vec<MutationRow>,
    pub(crate) identity: AttributeName,
}

impl ContributionChunk {
    /// Row snapshots for inspecting old/current values without modifying identity.
    pub fn rows(&self) -> &[MutationRow] {
        &self.rows
    }

    /// Adds or replaces a column in row order. None leaves that row untouched;
    /// Some(Value::Null) explicitly sets null. The length must match the chunk.
    /// Repeated insert IDs inherit contributions to their preceding occurrence.
    pub fn add_column(
        &mut self,
        attribute: AttributeName,
        values: Vec<Option<Value>>,
    ) -> JoiResult<()> {
        if self.kind == MutationKind::Delete {
            joi_bail!("cannot add columns to a delete chunk");
        }
        if attribute == self.identity {
            joi_bail!("contributors cannot modify primary keys");
        }
        if values.len() != self.rows.len() {
            joi_bail!("contributed column length must match chunk length");
        }
        let mut previous = HashMap::new();
        for (row, value) in self.rows.iter_mut().zip(values) {
            let current = row.new_value.as_mut().expect("upsert row");
            // Repeated insert IDs see columns contributed to their preceding row.
            // Preserve an explicitly changed cell, but advance inherited values.
            if let Some(prior) = previous.get(&row.entity_id)
                && let Some(old) = row.old_value.as_mut()
            {
                if old.get(attribute.0.as_str()) == current.get(attribute.0.as_str()) {
                    current.insert(attribute.0.to_string(), Value::clone(prior));
                }
                old.insert(attribute.0.to_string(), Value::clone(prior));
            }
            if let Some(value) = value {
                current.insert(attribute.0.to_string(), value);
            }
            if self.kind == MutationKind::Insert
                && let Some(value) = current.get(attribute.0.as_str())
            {
                previous.insert(row.entity_id.clone(), value.clone());
            }
        }
        Ok(())
    }

    /// Computes actual changes at this point in the pipeline, omitting no-ops.
    pub fn changes(&self) -> impl Iterator<Item = EntityMutation> + '_ {
        self.rows
            .iter()
            .filter(|row| row.is_changed())
            .filter_map(|row| {
                EntityMutation::between(
                    &self.table,
                    &row.entity_id,
                    row.old_value.clone(),
                    row.new_value.clone(),
                )
            })
    }
}

/// Read-only storage access and staged, replaceable private state for a chunk.
///
/// The datastore's exclusive mutation lock covers reads, allocation, and commit.
/// Nothing is written until the entire chunk (including history) has been prepared.
pub struct MutationPreparation<'a> {
    store: &'a dyn KeyValueStore,
    allowed: HashSet<TableName>,
    state: HashMap<(TableName, Vec<u8>), Vec<u8>>,
}

impl<'a> MutationPreparation<'a> {
    pub(crate) fn new(store: &'a dyn KeyValueStore, buckets: Vec<TableName>) -> Self {
        Self {
            store,
            allowed: buckets.into_iter().collect(),
            state: HashMap::new(),
        }
    }

    /// Reads authoritative entities, not the potentially lagging search index.
    pub fn store(&self) -> &dyn KeyValueStore {
        self.store
    }

    /// Reads staged state first, then its persisted value from an owned private bucket.
    pub fn state(&self, table: &TableName, key: &[u8]) -> JoiResult<Option<Vec<u8>>> {
        if !self.allowed.contains(table) {
            joi_bail!("contributor does not own bucket `{}`", table.0);
        }
        if let Some(value) = self.state.get(&(table.clone(), key.to_vec())) {
            return Ok(Some(value.clone()));
        }
        Ok(self
            .store
            .query_ids(table, &[key])?
            .into_iter()
            .next()
            .map(|entry| entry.value))
    }

    /// Stages an insert or replacement; repeated sets to a key keep its final value.
    pub fn set_state(&mut self, table: TableName, key: Vec<u8>, value: Vec<u8>) -> JoiResult<()> {
        if !self.allowed.contains(&table) {
            joi_bail!("contributor does not own bucket `{}`", table.0);
        }
        self.state.insert((table, key), value);
        Ok(())
    }

    pub(crate) fn into_mutations(self) -> Vec<KeyValueMutation> {
        let mut tables: HashMap<TableName, Vec<KeyValue>> = HashMap::new();
        for ((table, key), value) in self.state {
            tables
                .entry(table)
                .or_default()
                .push(KeyValue { key, value });
        }
        tables
            .into_iter()
            .map(|(table, entries)| KeyValueMutation::Set(KeyValueSetMutation { table, entries }))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn columns_validate_shape_and_identity_and_distinguish_null_from_unchanged() {
        let mut chunk = ContributionChunk {
            table: TableName("items".into()),
            kind: MutationKind::Update,
            identity: AttributeName("id".into()),
            rows: ["a", "b"]
                .into_iter()
                .map(|id| {
                    let value = json!({"id": id, "name": "Before"})
                        .as_object()
                        .unwrap()
                        .clone();
                    MutationRow {
                        entity_id: id.into(),
                        old_value: Some(value.clone()),
                        new_value: Some(value),
                    }
                })
                .collect(),
        };
        assert!(
            chunk
                .add_column(AttributeName("name".into()), vec![Some(json!("bad"))])
                .is_err()
        );
        assert!(
            chunk
                .add_column(AttributeName("id".into()), vec![None, None])
                .is_err()
        );
        assert_eq!(chunk.changes().count(), 0);
        chunk
            .add_column(AttributeName("name".into()), vec![None, Some(Value::Null)])
            .unwrap();
        assert_eq!(
            chunk.rows()[0].new_value.as_ref().unwrap()["name"],
            "Before"
        );
        let changes = chunk.changes().collect::<Vec<_>>();
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].changes[0].new_value, Some(Value::Null));
        chunk.kind = MutationKind::Delete;
        assert!(
            chunk
                .add_column(AttributeName("name".into()), vec![None, None])
                .is_err()
        );
    }
}
