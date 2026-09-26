use std::collections::{BTreeSet, HashMap, HashSet};

use joi_base::JoiString;
use joi_error::{JoiResult, joi_bail, report};
use serde_json::{Map, Value};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

use crate::{
    command_handler::CommandUser,
    data_store::{AttributeName, TableName},
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
    /// Complete final attributes, absent for deletion.
    pub new_value: Option<Map<String, Value>>,
    /// Sorted keys whose values or presence changed.
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
    /// Tables whose changes need old/new states prepared for this contributor.
    fn applies_to(&self, table: &TableName) -> bool;
    /// Exclusively owned auxiliary buckets, checked against all entity namespaces.
    fn buckets(&self) -> Vec<TableName>;
    /// Server-owned columns populated during insert preparation. Clients cannot write these.
    fn generated_attributes(&self, _table: &TableName) -> Vec<AttributeName> {
        Vec::new()
    }
    /// Prepares inserted records and private state before history and indexing.
    /// State writes commit atomically with this chunk; this hook must have no external effects.
    fn prepare_insert(
        &self,
        _context: &MutationContext,
        _table: &TableName,
        _records: &mut [Map<String, Value>],
        _preparation: &mut MutationPreparation<'_>,
    ) -> JoiResult<()> {
        Ok(())
    }
    /// Whether this contributor supplies the standard entity history contract.
    fn provides_history(&self, _table: &TableName) -> bool {
        false
    }
    /// Inspects actual changes and appends entries to the same KV transaction.
    fn contribute(
        &self,
        context: &MutationContext,
        mutations: &[EntityMutation],
        entries: &mut MutationEntries,
    ) -> JoiResult<()>;
}

/// Read-only storage access and staged, replaceable private state for insert preparation.
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
