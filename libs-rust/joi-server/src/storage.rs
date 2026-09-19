use std::{
    collections::{HashMap, HashSet},
    path::Path,
};

use joi_error::{JoiResult, joi_bail, joi_error, report};
use serde_json::{Map, Value as JsonValue};

use crate::{
    data_store::{
        AttributeColumn, ColumnDataType, DataStore, DataStoreCountValue, DataStoreMutation,
        DataStoreMutationResult, DataStoreMutationStep, DataStoreQuery, DataStoreQueryResult,
        QueryCriterion, TableDescription, TableName, Values,
    },
    entity_store::{Entity, EntityId, EntityKey, EntityMutationStep},
    key_value_store::{KeyValue, KeyValueMutation, KeyValueMutations, KeyValueStore},
    redb_key_value_store::RedbKeyValueStore,
    search_index::SearchIndex,
    tantivy_search_index::TantivySearchIndex,
};

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
        let (steps, affected) = self.entity_mutation(mutation)?;
        let dirty_batches = self.dirty_mutations(&affected)?;
        let mut mutations = Self::entity_mutations(steps)?;
        mutations
            .mutations
            .extend(dirty_batches.iter().map(|batch| {
                KeyValueMutation::Set(crate::key_value_store::KeyValueSetMutation {
                    table: batch.table.clone(),
                    entries: vec![KeyValue {
                        key: batch.key.clone(),
                        value: batch.value.clone(),
                    }],
                })
            }));
        self.key_value_store.mutate(mutations)?;
        let mut changed = Vec::new();
        for key in &affected {
            if let Some(entity) = self.read(&key.entity_type, &key.id)? {
                changed.push(entity);
            }
        }
        let changed_keys = changed
            .iter()
            .map(|entity| (entity.entity_type.clone(), entity.id.clone()))
            .collect::<HashSet<_>>();
        let mut deleted: HashMap<TableName, Vec<EntityId>> = HashMap::new();
        for key in affected {
            if !changed_keys.contains(&(key.entity_type.clone(), key.id.clone())) {
                deleted.entry(key.entity_type).or_default().push(key.id);
            }
        }
        self.search_index.upsert(&changed)?;
        for (entity_type, ids) in deleted {
            self.search_index.delete(&entity_type, &ids)?;
        }
        self.clear_dirty_batches(&dirty_batches)?;
        Ok(DataStoreMutationResult {
            entities: return_entities.then_some(changed),
        })
    }
}

impl IndexedDataStore {
    fn read(&self, entity_type: &TableName, id: &EntityId) -> JoiResult<Option<Entity>> {
        let key = storage_key(entity_type, id);
        Ok(self
            .key_value_store
            .query_ids(&entities_table(), &[key.as_slice()])?
            .into_iter()
            .next()
            .map(|entry| Entity {
                entity_type: entity_type.clone(),
                id: id.clone(),
                data: entry.value,
            }))
    }

    fn read_many(&self, entity_type: &TableName, ids: &[EntityId]) -> JoiResult<Vec<Entity>> {
        let keys = ids
            .iter()
            .map(|id| storage_key(entity_type, id))
            .collect::<Vec<_>>();
        let references = keys.iter().map(Vec::as_slice).collect::<Vec<_>>();
        Ok(self
            .key_value_store
            .query_ids(&entities_table(), &references)?
            .into_iter()
            .filter_map(|entry| {
                let prefix = storage_prefix(entity_type);
                let id = entry.key.strip_prefix(prefix.as_slice())?;
                Some(Entity {
                    entity_type: entity_type.clone(),
                    id: EntityId::new(id),
                    data: entry.value,
                })
            })
            .collect())
    }

    fn read_all(&self, entity_type: &TableName) -> JoiResult<Vec<Entity>> {
        let prefix = storage_prefix(entity_type);
        let upper = prefix_upper_bound(&prefix);
        let entries = self
            .key_value_store
            .query_range(&entities_table(), prefix.as_slice()..upper.as_slice())?;
        Ok(entries
            .into_iter()
            .filter_map(|entry| {
                Some(Entity {
                    entity_type: entity_type.clone(),
                    id: EntityId::new(entry.key.strip_prefix(prefix.as_slice())?.to_vec()),
                    data: entry.value,
                })
            })
            .collect())
    }

    fn entity_mutations(steps: Vec<EntityMutationStep>) -> JoiResult<KeyValueMutations> {
        let mut mutations = Vec::new();
        for step in steps {
            match step {
                EntityMutationStep::Create(entity) | EntityMutationStep::Update(entity) => {
                    mutations.push(KeyValueMutation::Set(
                        crate::key_value_store::KeyValueSetMutation {
                            table: entities_table(),
                            entries: vec![KeyValue {
                                key: storage_key(&entity.entity_type, &entity.id),
                                value: entity.data,
                            }],
                        },
                    ));
                }
                EntityMutationStep::Delete(key) => {
                    let encoded = storage_key(&key.entity_type, &key.id);
                    mutations.push(KeyValueMutation::Remove(
                        crate::key_value_store::KeyValueRemoveMutation {
                            table: entities_table(),
                            keys: vec![encoded],
                        },
                    ));
                }
            }
        }
        Ok(KeyValueMutations { mutations })
    }

    fn dirty_mutations(&self, affected: &[EntityKey]) -> JoiResult<Vec<DirtyEntry>> {
        let mut by_type: HashMap<TableName, Vec<Vec<u8>>> = HashMap::new();
        for key in affected {
            by_type
                .entry(key.entity_type.clone())
                .or_default()
                .push(key.id.0.clone());
        }
        let mut result = Vec::new();
        for (entity_type, ids) in by_type {
            let table = dirty_table_name(&entity_type);
            let current = self
                .key_value_store
                .query_range(&table, &[]..&[u8::MAX; 8])?;
            let next = current
                .last()
                .map_or(Ok(0), |entry| dirty_sequence(&entry.key))?
                .checked_add(1)
                .ok_or_else(|| joi_error!("dirty sequence exhausted for `{}`", entity_type.0))?;
            for (offset, chunk) in ids.chunks(10_000).enumerate() {
                result.push(DirtyEntry {
                    table: table.clone(),
                    key: (next + offset as u64).to_be_bytes().to_vec(),
                    value: encode_ids(chunk),
                });
            }
        }
        Ok(result)
    }

    fn clear_dirty_batches(&mut self, batches: &[DirtyEntry]) -> JoiResult<()> {
        let mut by_table: HashMap<TableName, Vec<Vec<u8>>> = HashMap::new();
        for batch in batches {
            by_table
                .entry(batch.table.clone())
                .or_default()
                .push(batch.key.clone());
        }
        let mutations = by_table
            .into_iter()
            .map(|(table, keys)| {
                KeyValueMutation::Remove(crate::key_value_store::KeyValueRemoveMutation {
                    table,
                    keys,
                })
            })
            .collect();
        self.key_value_store.mutate(KeyValueMutations { mutations })
    }

    fn reindex_dirty(&mut self, entity_type: &TableName) -> JoiResult<()> {
        loop {
            let dirty_table = dirty_table_name(entity_type);
            let entries = self
                .key_value_store
                .query_range(&dirty_table, &[]..&[u8::MAX; 8])?;
            let batches = entries.into_iter().take(10_000).collect::<Vec<_>>();
            if batches.is_empty() {
                return Ok(());
            }
            let mut ids = Vec::new();
            for batch in &batches {
                ids.extend(decode_ids(&batch.value)?);
            }
            let entities = self.read_many(entity_type, &ids)?;
            self.search_index.upsert(&entities)?;
            let present = entities
                .iter()
                .map(|entity| entity.id.clone())
                .collect::<HashSet<_>>();
            let missing = ids
                .into_iter()
                .filter(|id| !present.contains(id))
                .collect::<Vec<_>>();
            if !missing.is_empty() {
                self.search_index.delete(entity_type, &missing)?;
            }
            let dirty_entries = batches
                .iter()
                .map(|entry| DirtyEntry {
                    table: dirty_table.clone(),
                    key: entry.key.clone(),
                    value: entry.value.clone(),
                })
                .collect::<Vec<_>>();
            self.clear_dirty_batches(&dirty_entries)?;
        }
    }

    fn entity_mutation(
        &self,
        mutation: DataStoreMutation,
    ) -> JoiResult<(Vec<EntityMutationStep>, Vec<EntityKey>)> {
        let mut steps = Vec::new();
        let mut affected = Vec::new();
        let mut staged: HashMap<(TableName, EntityId), Option<Entity>> = HashMap::new();
        for step in mutation.steps {
            match step {
                DataStoreMutationStep::Insert(insert) => {
                    let schema = self.schema(&insert.table_name)?;
                    validate_columns(schema, &insert.columns, true)?;
                    let row_count = insert
                        .columns
                        .first()
                        .map_or(0, |column| value_count(&column.values));
                    for row in 0..row_count {
                        let object = object_from_columns(&insert.columns, row);
                        self.validate_references(schema, &object, &staged)?;
                        let entity = entity_from_object(&insert.table_name, schema, object)?;
                        let key = (entity.entity_type.clone(), entity.id.clone());
                        if current_entity(self.key_value_store.as_ref(), &staged, &key)?.is_some() {
                            joi_bail!("entity `{}` already exists", display_id(&entity.id));
                        }
                        staged.insert(key.clone(), Some(entity.clone()));
                        affected.push(EntityKey {
                            entity_type: key.0,
                            id: key.1,
                        });
                        steps.push(EntityMutationStep::Create(entity));
                    }
                }
                DataStoreMutationStep::Update(update) => {
                    let schema = self.schema(&update.table_name)?;
                    validate_columns(schema, &update.columns, false)?;
                    if update
                        .columns
                        .iter()
                        .any(|column| column.attribute == schema.columns[0].name)
                    {
                        joi_bail!("primary-key attribute is immutable");
                    }
                    validate_unique_ids(&update.ids)?;
                    for (row, id) in update.ids.iter().enumerate() {
                        let entity_id = EntityId::new(id.as_bytes());
                        let key = (update.table_name.clone(), entity_id.clone());
                        let mut entity =
                            current_entity(self.key_value_store.as_ref(), &staged, &key)?
                                .ok_or_else(|| {
                                    joi_error!(
                                        "table `{}` has no record with ID `{id}`",
                                        update.table_name.0
                                    )
                                })?;
                        let mut object =
                            serde_json::from_slice::<Map<String, JsonValue>>(&entity.data)
                                .map_err(report)?;
                        for column in &update.columns {
                            object.insert(
                                column.attribute.0.to_string(),
                                json_value_at(&column.values, row),
                            );
                        }
                        self.validate_references(schema, &object, &staged)?;
                        entity.data = serde_json::to_vec(&object).map_err(report)?;
                        staged.insert(key.clone(), Some(entity.clone()));
                        affected.push(EntityKey {
                            entity_type: key.0,
                            id: key.1,
                        });
                        steps.push(EntityMutationStep::Update(entity));
                    }
                }
                DataStoreMutationStep::Delete(delete) => {
                    self.schema(&delete.table_name)?;
                    validate_unique_ids(&delete.ids)?;
                    for id in delete.ids {
                        let entity_id = EntityId::new(id.as_bytes());
                        let key = (delete.table_name.clone(), entity_id.clone());
                        if current_entity(self.key_value_store.as_ref(), &staged, &key)?.is_none() {
                            joi_bail!("entity `{id}` does not exist");
                        }
                        staged.insert(key.clone(), None);
                        affected.push(EntityKey {
                            entity_type: key.0.clone(),
                            id: key.1.clone(),
                        });
                        steps.push(EntityMutationStep::Delete(EntityKey {
                            entity_type: key.0,
                            id: key.1,
                        }));
                    }
                }
            }
        }
        deduplicate_keys(&mut affected);
        Ok((steps, affected))
    }

    fn schema(&self, table_name: &TableName) -> JoiResult<&TableDescription> {
        self.schemas
            .get(table_name)
            .ok_or_else(|| joi_error!("entity type `{}` has not been registered", table_name.0))
    }

    fn validate_references(
        &self,
        schema: &TableDescription,
        object: &Map<String, JsonValue>,
        staged: &HashMap<(TableName, EntityId), Option<Entity>>,
    ) -> JoiResult<()> {
        for column in &schema.columns {
            let Some(reference) = &column.references else {
                continue;
            };
            let Some(value) = object
                .get(column.name.0.as_str())
                .and_then(JsonValue::as_str)
            else {
                continue;
            };
            if value.is_empty() {
                continue;
            }
            let key = (reference.table.clone(), EntityId::new(value.as_bytes()));
            if current_entity(self.key_value_store.as_ref(), staged, &key)?.is_none() {
                joi_bail!(
                    "attribute `{}` references missing entity `{value}` in `{}`",
                    column.name.0,
                    reference.table.0
                );
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
    let row_count = columns
        .first()
        .map_or(0, |column| value_count(&column.values));
    let mut names = HashSet::new();
    for column in columns {
        if !names.insert(&column.attribute) {
            joi_bail!(
                "mutation contains duplicate attribute `{}`",
                column.attribute.0
            );
        }
        if value_count(&column.values) != row_count {
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
        if value_data_type(&column.values) != description.data_type {
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
        .map(|column| {
            (
                column.attribute.0.to_string(),
                json_value_at(&column.values, row),
            )
        })
        .collect()
}

fn json_value_at(values: &Values, index: usize) -> JsonValue {
    match values {
        Values::String(values) => JsonValue::String(values[index].to_string()),
        Values::NullableString(values) => values[index].as_ref().map_or(JsonValue::Null, |value| {
            JsonValue::String(value.to_string())
        }),
        Values::Int(values) => JsonValue::Number(values[index].into()),
    }
}

fn value_count(values: &Values) -> usize {
    match values {
        Values::String(values) => values.len(),
        Values::NullableString(values) => values.len(),
        Values::Int(values) => values.len(),
    }
}

fn value_data_type(values: &Values) -> ColumnDataType {
    match values {
        Values::String(_) | Values::NullableString(_) => ColumnDataType::String,
        Values::Int(_) => ColumnDataType::Int,
    }
}

fn current_entity(
    store: &dyn KeyValueStore,
    staged: &HashMap<(TableName, EntityId), Option<Entity>>,
    key: &(TableName, EntityId),
) -> JoiResult<Option<Entity>> {
    staged.get(key).cloned().map_or_else(
        || {
            let encoded = storage_key(&key.0, &key.1);
            Ok(store
                .query_ids(&entities_table(), &[encoded.as_slice()])?
                .into_iter()
                .next()
                .map(|value| Entity {
                    entity_type: key.0.clone(),
                    id: key.1.clone(),
                    data: value.value,
                }))
        },
        Ok,
    )
}

struct DirtyEntry {
    table: TableName,
    key: Vec<u8>,
    value: Vec<u8>,
}

fn dirty_table_name(entity_type: &TableName) -> TableName {
    TableName(format!("dirty_{}", entity_type.0).into())
}

fn entities_table() -> TableName {
    TableName("entities".into())
}

fn storage_prefix(entity_type: &TableName) -> Vec<u8> {
    let bytes = entity_type.0.as_bytes();
    let mut prefix = Vec::with_capacity(4 + bytes.len());
    prefix.extend_from_slice(&(bytes.len() as u32).to_be_bytes());
    prefix.extend_from_slice(bytes);
    prefix
}

fn storage_key(entity_type: &TableName, id: &EntityId) -> Vec<u8> {
    let mut key = storage_prefix(entity_type);
    key.extend_from_slice(id.as_bytes());
    key
}

fn prefix_upper_bound(prefix: &[u8]) -> Vec<u8> {
    let mut upper = prefix.to_vec();
    for byte in upper.iter_mut().rev() {
        if *byte != u8::MAX {
            *byte += 1;
            return upper;
        }
        *byte = 0;
    }
    upper.push(0);
    upper
}

fn encode_ids(ids: &[Vec<u8>]) -> Vec<u8> {
    let mut encoded = (ids.len() as u32).to_be_bytes().to_vec();
    for id in ids {
        encoded.extend_from_slice(&(id.len() as u32).to_be_bytes());
        encoded.extend_from_slice(id);
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

fn dirty_sequence(key: &[u8]) -> JoiResult<u64> {
    let bytes: [u8; 8] = key
        .try_into()
        .map_err(|_| joi_error!("dirty entry has an invalid sequence key"))?;
    Ok(u64::from_be_bytes(bytes))
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

fn deduplicate_keys(keys: &mut Vec<EntityKey>) {
    let mut seen = HashSet::new();
    keys.retain(|key| seen.insert((key.entity_type.clone(), key.id.clone())));
}

fn display_id(id: &EntityId) -> String {
    String::from_utf8_lossy(id.as_bytes()).into_owned()
}
