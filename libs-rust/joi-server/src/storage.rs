use std::{
    collections::{HashMap, HashSet},
    ops::Range,
    path::Path,
};

use joi_error::{JoiResult, joi_bail, joi_error, report};
use serde_json::{Map, Value as JsonValue};

use crate::key_value_store::{KeyValueRemoveMutation, KeyValueSetMutation};
use crate::{
    data_store::{
        AttributeColumn, ColumnDataType, DataStore, DataStoreCountValue, DataStoreMutation,
        DataStoreMutationResult, DataStoreMutationStep, DataStoreQuery, DataStoreQueryResult,
        QueryCriterion, TableDescription, TableName, Values,
    },
    entity_store::{Entity, EntityId},
    key_value_store::{KeyValue, KeyValueMutation, KeyValueMutations, KeyValueStore},
    redb_key_value_store::RedbKeyValueStore,
    search_index::SearchIndex,
    tantivy_search_index::TantivySearchIndex,
};

/// Maximum rows committed and indexed as one unit.
///
/// Bounds each key/value transaction and keeps per-chunk index work small,
/// so large imports stay responsive and a failed chunk only abandons its
/// own rows instead of the whole request.
const MUTATION_CHUNK_SIZE: usize = 10_000;

/// Coordinates authoritative entity storage with a derived search index.
pub struct IndexedDataStore {
    key_value_store: Box<dyn KeyValueStore>,
    search_index: Box<dyn SearchIndex>,
    schemas: HashMap<TableName, TableDescription>,
    _temporary_directory: Option<tempfile::TempDir>,
}

impl IndexedDataStore {
    /// Opens persistent redb entity storage and a derived Tantivy index.
    pub fn open(
        entity_store_path: impl AsRef<Path>,
        search_index_path: impl AsRef<Path>,
    ) -> JoiResult<Self> {
        Ok(Self {
            key_value_store: Box::new(RedbKeyValueStore::open(entity_store_path)?),
            search_index: Box::new(TantivySearchIndex::open(search_index_path)?),
            schemas: HashMap::new(),
            _temporary_directory: None,
        })
    }

    /// Creates an isolated store for tests.
    pub fn in_memory() -> JoiResult<Self> {
        let directory = tempfile::tempdir().map_err(report)?;
        let mut store = Self::open(
            directory.path().join("entities.redb"),
            directory.path().join("search"),
        )?;
        store._temporary_directory = Some(directory);
        Ok(store)
    }

    /// Creates a coordinator from custom storage implementations.
    pub fn from_parts(
        key_value_store: Box<dyn KeyValueStore>,
        search_index: Box<dyn SearchIndex>,
    ) -> Self {
        Self {
            key_value_store,
            search_index,
            schemas: HashMap::new(),
            _temporary_directory: None,
        }
    }
}

impl DataStore for IndexedDataStore {
    fn ensure_tables(&mut self, tables: Vec<TableDescription>) -> JoiResult<()> {
        let mut schemas = HashMap::new();
        for table in &tables {
            validate_schema(table)?;
            if schemas.insert(table.name.clone(), table.clone()).is_some() {
                joi_bail!("entity type `{}` is defined more than once", table.name.0);
            }
        }
        let entity_types = schemas.keys().cloned().collect::<Vec<_>>();
        self.search_index.prepare(tables)?;
        for entity_type in &entity_types {
            if self.search_index.is_empty(entity_type)? {
                let entities = self.read_all(entity_type)?;
                self.search_index.rebuild(entity_type, &entities)?;
            }
            self.reindex_dirty(entity_type)?;
        }
        // Publish schemas only after preparation and replay succeed, so a
        // failed ensure_tables leaves the previous registrations intact
        // instead of half-updated ones.
        self.schemas = schemas;
        Ok(())
    }

    fn query_rows(
        &self,
        query: DataStoreQuery,
        _count_all_rows: bool,
    ) -> JoiResult<DataStoreQueryResult> {
        self.search_index.query_rows(query)
    }

    fn count(
        &self,
        table_name: &TableName,
        criterion: &QueryCriterion,
        attribute: Option<&crate::data_store::AttributeName>,
        max_results: usize,
    ) -> JoiResult<Vec<DataStoreCountValue>> {
        self.search_index
            .count(table_name, criterion, attribute, max_results)
    }

    fn mutate(&mut self, mutation: DataStoreMutation) -> JoiResult<DataStoreMutationResult> {
        let return_entities = mutation.return_entities;
        let mutation_steps = mutation.steps;
        let mut returned_entities = Vec::new();

        self.validate_mutation_steps(&mutation_steps)?;

        // Every chunk follows the same durable indexing workflow:
        //
        // 1. Compute each entity's final state in the chunk in memory.
        // 2. Commit those entity mutations and the corresponding dirty entry
        //    in one key/value transaction.
        // 3. Index the entities from step 1 directly; no reread is necessary.
        // 4. Remove the dirty entry only after indexing succeeds. If indexing
        //    or cleanup fails, the entry remains available for startup replay.
        //
        // Chunking bounds transaction size and keeps the index work responsive
        // for large imports. A later failed chunk can therefore leave earlier
        // chunks committed and recoverable, rather than rolling back the whole
        // request after work has already been indexed.
        for chunk in mutation_chunks(&mutation_steps) {
            let batch = self.build_chunk(chunk)?;
            let committed = self.commit_chunk(batch)?;
            if return_entities {
                committed.merge_into(&mut returned_entities);
            }
        }
        Ok(DataStoreMutationResult {
            entities: return_entities.then_some(returned_entities),
        })
    }
}

impl IndexedDataStore {
    fn read_many(&self, entity_type: &TableName, ids: &[EntityId]) -> JoiResult<Vec<Entity>> {
        let keys = ids.iter().map(|id| id.0.clone()).collect::<Vec<_>>();
        let references = keys.iter().map(Vec::as_slice).collect::<Vec<_>>();
        Ok(self
            .key_value_store
            .query_ids(entity_type, &references)?
            .into_iter()
            .map(|entry| Entity {
                entity_type: entity_type.clone(),
                id: EntityId::new(entry.key),
                data: entry.value,
            })
            .collect())
    }

    fn read_all(&self, entity_type: &TableName) -> JoiResult<Vec<Entity>> {
        let entries = self
            .key_value_store
            .query_range(entity_type, &[]..&[u8::MAX])?;
        Ok(entries
            .into_iter()
            .map(|entry| Entity {
                entity_type: entity_type.clone(),
                id: EntityId::new(entry.key),
                data: entry.value,
            })
            .collect())
    }

    /// Computes one chunk's final row states without persisting anything.
    fn build_chunk(&self, chunk: MutationChunk<'_>) -> JoiResult<ChunkBatch> {
        let table = chunk.step.table().clone();
        let mut ids = Vec::new();
        let effect = match chunk.step {
            DataStoreMutationStep::Insert(mutation) => {
                let schema = self.schema(&mutation.table_name)?;
                let mut entities = Vec::new();
                let mut entries = Vec::new();
                for row in chunk.rows.clone() {
                    let object = object_from_columns(&mutation.columns, row);
                    let entity = entity_from_object(&mutation.table_name, schema, object)?;
                    ids.push(entity.id.clone());
                    entities.push(entity.clone());
                    entries.push(KeyValue {
                        key: entity.id.0.clone(),
                        value: entity.data,
                    });
                }
                ChunkEffect::Upsert { entities, entries }
            }
            DataStoreMutationStep::Update(mutation) => {
                let mut entities = Vec::new();
                let mut entries = Vec::new();
                for row in chunk.rows.clone() {
                    let id = &mutation.ids[row];
                    let entity_id = EntityId::new(id.as_bytes());
                    let mut entity = read_entity(
                        self.key_value_store.as_ref(),
                        &mutation.table_name,
                        &entity_id,
                    )?
                    .ok_or_else(|| {
                        joi_error!(
                            "table `{}` has no record with ID `{id}`",
                            mutation.table_name.0
                        )
                    })?;
                    let mut object = serde_json::from_slice::<Map<String, JsonValue>>(&entity.data)
                        .map_err(report)?;
                    for column in &mutation.columns {
                        object.insert(column.attribute.0.to_string(), column.values.value_at(row));
                    }
                    entity.data = serde_json::to_vec(&object).map_err(report)?;
                    ids.push(entity.id.clone());
                    entities.push(entity.clone());
                    entries.push(KeyValue {
                        key: entity.id.0.clone(),
                        value: entity.data,
                    });
                }
                ChunkEffect::Upsert { entities, entries }
            }
            DataStoreMutationStep::Delete(mutation) => {
                let mut keys = Vec::new();
                for row in chunk.rows.clone() {
                    let id = &mutation.ids[row];
                    let entity_id = EntityId::new(id.as_bytes());
                    ids.push(entity_id.clone());
                    keys.push(entity_id.0.clone());
                }
                ChunkEffect::Delete { keys }
            }
        };
        Ok(ChunkBatch {
            dirty_table: dirty_table_name(&table),
            table,
            dirty_key: new_dirty_key(),
            ids,
            effect,
        })
    }

    /// Persists one built chunk and advances the search index past it.
    fn commit_chunk(&mut self, batch: ChunkBatch) -> JoiResult<CommittedChunk> {
        let ChunkBatch {
            table,
            dirty_table,
            dirty_key,
            ids,
            effect,
        } = batch;
        let (entity_mutation, entities, is_delete) = match effect {
            ChunkEffect::Upsert { entities, entries } => (
                KeyValueMutation::Set(KeyValueSetMutation {
                    table: table.clone(),
                    entries,
                }),
                entities,
                false,
            ),
            ChunkEffect::Delete { keys } => (
                KeyValueMutation::Remove(KeyValueRemoveMutation {
                    table: table.clone(),
                    keys,
                }),
                Vec::new(),
                true,
            ),
        };
        // Exactly two operations are committed for every chunk: the
        // entity Set/Remove and the single dirty-entry Set.
        let mutations = vec![
            entity_mutation,
            KeyValueMutation::Set(KeyValueSetMutation {
                table: dirty_table.clone(),
                entries: vec![KeyValue {
                    key: dirty_key.clone(),
                    value: encode_ids(&ids),
                }],
            }),
        ];
        self.key_value_store.mutate(KeyValueMutations {
            mutations: &mutations,
        })?;
        self.index_entities(&table, &ids, &entities)?;
        self.clear_dirty_entry(DirtyEntry {
            table: dirty_table,
            key: dirty_key,
        })?;
        Ok(CommittedChunk {
            table,
            ids,
            entities,
            is_delete,
        })
    }

    /// Applies one chunk's final states to the search index.
    ///
    /// Present entities are upserted and IDs with no stored entity are
    /// deleted, so the mutation fast path and crash replay converge through
    /// this one definition instead of reimplementing the sync in two places.
    fn index_entities(
        &mut self,
        table: &TableName,
        ids: &[EntityId],
        entities: &[Entity],
    ) -> JoiResult<()> {
        if !entities.is_empty() {
            self.search_index.upsert(entities)?;
        }
        let present = entities
            .iter()
            .map(|entity| &entity.id)
            .collect::<HashSet<_>>();
        let missing = ids
            .iter()
            .filter(|id| !present.contains(id))
            .cloned()
            .collect::<Vec<_>>();
        if !missing.is_empty() {
            self.search_index.delete(table, &missing)?;
        }
        Ok(())
    }

    fn clear_dirty_entry(&mut self, entry: DirtyEntry) -> JoiResult<()> {
        let mutations = vec![KeyValueMutation::Remove(KeyValueRemoveMutation {
            table: entry.table,
            keys: vec![entry.key],
        })];
        self.key_value_store.mutate(KeyValueMutations {
            mutations: &mutations,
        })
    }

    fn reindex_dirty(&mut self, entity_type: &TableName) -> JoiResult<()> {
        loop {
            let dirty_table = dirty_table_name(entity_type);
            let Some(entry) = self.key_value_store.query_oldest(&dirty_table)? else {
                return Ok(());
            };
            let ids = decode_ids(&entry.value)?;
            let entities = self.read_many(entity_type, &ids)?;
            self.index_entities(entity_type, &ids, &entities)?;
            self.clear_dirty_entry(DirtyEntry {
                table: dirty_table,
                key: entry.key,
            })?;
        }
    }

    fn schema(&self, table_name: &TableName) -> JoiResult<&TableDescription> {
        self.schemas
            .get(table_name)
            .ok_or_else(|| joi_error!("entity type `{}` has not been registered", table_name.0))
    }

    /// Validates mutation declarations before any chunk can persist.
    ///
    /// This covers only checks that need no stored state (schemas, column
    /// shapes, duplicate IDs). Existence checks stay in `build_chunk`
    /// because earlier chunks commit as the request runs, so what "exists"
    /// changes chunk by chunk.
    fn validate_mutation_steps(&self, steps: &[DataStoreMutationStep]) -> JoiResult<()> {
        for step in steps {
            match step {
                DataStoreMutationStep::Insert(mutation) => {
                    validate_columns(self.schema(&mutation.table_name)?, &mutation.columns, true)?;
                }
                DataStoreMutationStep::Update(mutation) => {
                    let schema = self.schema(&mutation.table_name)?;
                    validate_columns(schema, &mutation.columns, false)?;
                    if mutation
                        .columns
                        .iter()
                        .any(|column| column.attribute == schema.columns[0].name)
                    {
                        joi_bail!("primary-key attribute is immutable");
                    }
                    validate_unique_ids(&mutation.ids)?;
                }
                DataStoreMutationStep::Delete(mutation) => {
                    self.schema(&mutation.table_name)?;
                    validate_unique_ids(&mutation.ids)?;
                }
            }
        }
        Ok(())
    }
}

fn validate_schema(schema: &TableDescription) -> JoiResult<()> {
    if schema.columns.is_empty() {
        joi_bail!(
            "entity type `{}` must define at least one attribute",
            schema.name.0
        );
    }
    if schema.columns[0].data_type != ColumnDataType::String {
        joi_bail!(
            "entity type `{}` must have a string primary key",
            schema.name.0
        );
    }
    let mut names = HashSet::new();
    for column in &schema.columns {
        if !names.insert(&column.name) {
            joi_bail!(
                "entity type `{}` defines duplicate attributes",
                schema.name.0
            );
        }
    }
    Ok(())
}

fn validate_columns(
    schema: &TableDescription,
    columns: &[AttributeColumn],
    require_complete: bool,
) -> JoiResult<()> {
    let row_count = columns.first().map_or(0, |column| column.values.len());
    let mut names = HashSet::new();
    for column in columns {
        if !names.insert(&column.attribute) {
            joi_bail!(
                "mutation contains duplicate attribute `{}`",
                column.attribute.0
            );
        }
        if column.values.len() != row_count {
            joi_bail!("all mutation columns must contain the same number of values");
        }
        let description = schema
            .columns
            .iter()
            .find(|candidate| candidate.name == column.attribute)
            .ok_or_else(|| {
                joi_error!(
                    "entity type `{}` has no attribute `{}`",
                    schema.name.0,
                    column.attribute.0
                )
            })?;
        if column.values.data_type() != description.data_type {
            joi_bail!(
                "attribute `{}` has values of the wrong type",
                column.attribute.0
            );
        }
        if !description.optional
            && matches!(&column.values, Values::NullableString(values) if values.iter().any(Option::is_none))
        {
            joi_bail!(
                "attribute `{}` does not allow null values",
                column.attribute.0
            );
        }
    }
    if require_complete {
        for column in &schema.columns {
            if !column.optional && !names.contains(&column.name) {
                joi_bail!("insert is missing required attribute `{}`", column.name.0);
            }
        }
    }
    Ok(())
}

fn entity_from_object(
    entity_type: &TableName,
    schema: &TableDescription,
    object: Map<String, JsonValue>,
) -> JoiResult<Entity> {
    let primary_key = &schema.columns[0].name;
    let id = object
        .get(primary_key.0.as_str())
        .and_then(JsonValue::as_str)
        .ok_or_else(|| joi_error!("primary-key attribute `{}` must be a string", primary_key.0))?;
    Ok(Entity {
        entity_type: entity_type.clone(),
        id: EntityId::new(id.as_bytes()),
        data: serde_json::to_vec(&object).map_err(report)?,
    })
}

fn object_from_columns(columns: &[AttributeColumn], row: usize) -> Map<String, JsonValue> {
    columns
        .iter()
        .map(|column| (column.attribute.0.to_string(), column.values.value_at(row)))
        .collect()
}

fn read_entity(
    store: &dyn KeyValueStore,
    entity_type: &TableName,
    id: &EntityId,
) -> JoiResult<Option<Entity>> {
    let values = store.query_ids(entity_type, &[id.as_bytes()])?;
    Ok(values.into_iter().next().map(|value| Entity {
        entity_type: entity_type.clone(),
        id: id.clone(),
        data: value.value,
    }))
}

struct DirtyEntry {
    table: TableName,
    key: Vec<u8>,
}

/// One chunk with its computed row states, ready to commit.
///
/// The row vectors travel together so that adding another per-row
/// collection touches the builders once instead of once per step type.
struct ChunkBatch {
    /// The table the chunk reads or writes.
    table: TableName,
    /// Durable queue recording this chunk for crash replay.
    dirty_table: TableName,
    /// Unique key of this chunk's entry in the dirty queue.
    dirty_key: Vec<u8>,
    /// Primary-key IDs addressed by the chunk, in row order.
    ids: Vec<EntityId>,
    /// How the chunk changes stored entities.
    effect: ChunkEffect,
}

/// How a chunk changes stored entities.
enum ChunkEffect {
    /// Inserts or updates carrying their final states.
    Upsert {
        /// Final entity states, in row order.
        entities: Vec<Entity>,
        /// Key/value writes applying those states.
        entries: Vec<KeyValue>,
    },
    /// Deletes carrying the keys to remove.
    Delete {
        /// Keys to remove from the entity table.
        keys: Vec<Vec<u8>>,
    },
}

/// One chunk after its commit, carrying what callers observe.
struct CommittedChunk {
    /// The table the chunk read or wrote.
    table: TableName,
    /// Primary-key IDs addressed by the chunk, in row order.
    ids: Vec<EntityId>,
    /// Final entity states (empty for deletes).
    entities: Vec<Entity>,
    /// Whether the chunk deleted instead of upserting.
    ///
    /// Only the returned-entity merge needs this: upserts keep their
    /// position in the caller's list while deletes remove earlier states.
    /// Indexing needs no flag since it derives everything from
    /// present-versus-missing IDs.
    is_delete: bool,
}

impl CommittedChunk {
    /// Folds this chunk into the entities returned to the caller.
    ///
    /// Later chunks overwrite earlier states of the same record, and deletes
    /// remove any previously collected state for the deleted IDs.
    fn merge_into(self, returned: &mut Vec<Entity>) {
        for entity in self.entities {
            if let Some(existing) = returned.iter_mut().find(|existing: &&mut Entity| {
                existing.entity_type == entity.entity_type && existing.id == entity.id
            }) {
                *existing = entity;
            } else {
                returned.push(entity);
            }
        }
        if self.is_delete {
            returned.retain(|entity| {
                entity.entity_type != self.table || !self.ids.contains(&entity.id)
            });
        }
    }
}

/// A zero-copy view of one planned mutation chunk.
///
/// The chunk references its original [`DataStoreMutationStep`] and a row
/// range within the step's contained vector. A chunk therefore always covers
/// one table type and at most [`MUTATION_CHUNK_SIZE`] rows.
struct MutationChunk<'a> {
    /// The original high-level mutation step.
    step: &'a DataStoreMutationStep,
    /// The rows from the step processed by this chunk.
    rows: Range<usize>,
}

/// Splits [`DataStoreMutationStep`] values into row-bounded views.
fn mutation_chunks<'a>(steps: &'a [DataStoreMutationStep]) -> Vec<MutationChunk<'a>> {
    let mut chunks = Vec::new();
    for step in steps {
        let length = step.len();
        let mut start = 0;
        while start < length {
            let end = (start + MUTATION_CHUNK_SIZE).min(length);
            chunks.push(MutationChunk {
                step,
                rows: start..end,
            });
            start = end;
        }
    }
    chunks
}

fn dirty_table_name(entity_type: &TableName) -> TableName {
    TableName(format!("dirty_{}", entity_type.0).into())
}

/// Generates a unique, roughly time-ordered dirty-entry key.
///
/// KSUIDs sort by creation time and need no coordination, so key allocation
/// is a pure function: no store scan and no read-then-write race.
fn new_dirty_key() -> Vec<u8> {
    ksuid::Ksuid::generate().as_bytes().to_vec()
}

/// Encodes entity IDs as length-prefixed bytes.
///
/// IDs are arbitrary bytes that may contain any value, so each frame carries
/// its own length instead of relying on a separator byte.
fn encode_ids(ids: &[EntityId]) -> Vec<u8> {
    let mut encoded = (ids.len() as u32).to_be_bytes().to_vec();
    for id in ids {
        encoded.extend_from_slice(&(id.0.len() as u32).to_be_bytes());
        encoded.extend_from_slice(&id.0);
    }
    encoded
}

fn decode_ids(mut encoded: &[u8]) -> JoiResult<Vec<EntityId>> {
    let count = read_u32(&mut encoded)? as usize;
    let mut result = Vec::with_capacity(count);
    for _ in 0..count {
        let length = read_u32(&mut encoded)? as usize;
        if encoded.len() < length {
            joi_bail!("dirty entry contains a truncated ID");
        }
        result.push(EntityId::new(encoded[..length].to_vec()));
        encoded = &encoded[length..];
    }
    if !encoded.is_empty() {
        joi_bail!("dirty entry contains trailing data");
    }
    Ok(result)
}

fn read_u32(bytes: &mut &[u8]) -> JoiResult<u32> {
    if bytes.len() < 4 {
        joi_bail!("dirty entry contains a truncated length");
    }
    let (head, tail) = bytes.split_at(4);
    *bytes = tail;
    Ok(u32::from_be_bytes(head.try_into().expect("length checked")))
}

fn validate_unique_ids(ids: &[joi_base::JoiString]) -> JoiResult<()> {
    let mut unique = HashSet::new();
    for id in ids {
        if !unique.insert(id) {
            joi_bail!("mutation contains duplicate ID `{id}`");
        }
    }
    Ok(())
}
