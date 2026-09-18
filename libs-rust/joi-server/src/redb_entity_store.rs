use std::{collections::HashMap, path::Path};

use joi_error::{JoiResult, joi_bail, joi_error, report};
use redb::{Database, ReadableDatabase, ReadableTable, TableDefinition};

use crate::{
    data_store::TableName,
    entity_store::{
        DirtyBatch, Entity, EntityId, EntityKey, EntityMutation, EntityMutationResult,
        EntityMutationStep, EntityStore,
    },
};

const ENTITIES: TableDefinition<&[u8], &[u8]> = TableDefinition::new("entities");
const DIRTY_SEQUENCES: TableDefinition<&[u8], u64> = TableDefinition::new("dirty_sequences");
const DIRTY_BATCH_SIZE: usize = 10_000;
const DIRTY_TABLE_PREFIX: &str = "dirty_";

/// redb-backed primary storage for opaque binary entities.
pub struct RedbEntityStore {
    database: Database,
}

impl RedbEntityStore {
    /// Opens or creates an entity store at `path`.
    pub fn open(path: impl AsRef<Path>) -> JoiResult<Self> {
        let database = Database::create(path).map_err(report)?;
        let write = database.begin_write().map_err(report)?;
        write.open_table(ENTITIES).map_err(report)?;
        write.open_table(DIRTY_SEQUENCES).map_err(report)?;
        write.commit().map_err(report)?;
        Ok(Self { database })
    }
}

impl EntityStore for RedbEntityStore {
    fn prepare_dirty_tables(&mut self, entity_types: &[TableName]) -> JoiResult<()> {
        let transaction = self.database.begin_write().map_err(report)?;
        for entity_type in entity_types {
            let name = dirty_table_name(entity_type);
            transaction
                .open_table(TableDefinition::<u64, &[u8]>::new(&name))
                .map_err(report)?;
        }
        transaction.commit().map_err(report)
    }

    fn create(&mut self, entity: Entity) -> JoiResult<()> {
        self.mutate(EntityMutation {
            steps: vec![EntityMutationStep::Create(entity)],
            return_entities: false,
        })?;
        Ok(())
    }

    fn read(&self, entity_type: &TableName, id: &EntityId) -> JoiResult<Option<Entity>> {
        let transaction = self.database.begin_read().map_err(report)?;
        let table = transaction.open_table(ENTITIES).map_err(report)?;
        let key = storage_key(entity_type, id);
        let value = table.get(key.as_slice()).map_err(report)?;
        Ok(value.map(|value| Entity {
            entity_type: entity_type.clone(),
            id: id.clone(),
            data: value.value().to_vec(),
        }))
    }

    fn update(&mut self, entity: Entity) -> JoiResult<()> {
        self.mutate(EntityMutation {
            steps: vec![EntityMutationStep::Update(entity)],
            return_entities: false,
        })?;
        Ok(())
    }

    fn delete(&mut self, entity_type: &TableName, id: &EntityId) -> JoiResult<()> {
        self.mutate(EntityMutation {
            steps: vec![EntityMutationStep::Delete(EntityKey {
                entity_type: entity_type.clone(),
                id: id.clone(),
            })],
            return_entities: false,
        })?;
        Ok(())
    }

    fn read_all(&self, entity_type: &TableName) -> JoiResult<Vec<Entity>> {
        let transaction = self.database.begin_read().map_err(report)?;
        let table = transaction.open_table(ENTITIES).map_err(report)?;
        let prefix = storage_prefix(entity_type);
        let upper = prefix_upper_bound(&prefix);
        let entries = table
            .range(prefix.as_slice()..upper.as_slice())
            .map_err(report)?;
        entries
            .map(|entry| {
                let (key, value) = entry.map_err(report)?;
                Ok(Entity {
                    entity_type: entity_type.clone(),
                    id: EntityId::new(key.value()[prefix.len()..].to_vec()),
                    data: value.value().to_vec(),
                })
            })
            .collect()
    }

    fn read_many(&self, entity_type: &TableName, ids: &[EntityId]) -> JoiResult<Vec<Entity>> {
        let transaction = self.database.begin_read().map_err(report)?;
        let table = transaction.open_table(ENTITIES).map_err(report)?;
        ids.iter()
            .map(|id| {
                let key = storage_key(entity_type, id);
                Ok(table
                    .get(key.as_slice())
                    .map_err(report)?
                    .map(|value| Entity {
                        entity_type: entity_type.clone(),
                        id: id.clone(),
                        data: value.value().to_vec(),
                    }))
            })
            .filter_map(|result| match result {
                Ok(Some(entity)) => Some(Ok(entity)),
                Ok(None) => None,
                Err(error) => Some(Err(error)),
            })
            .collect()
    }

    fn read_dirty_batches(
        &self,
        entity_type: &TableName,
        max_ids: usize,
    ) -> JoiResult<Vec<DirtyBatch>> {
        if max_ids == 0 {
            return Ok(Vec::new());
        }
        let transaction = self.database.begin_read().map_err(report)?;
        let name = dirty_table_name(entity_type);
        let table = transaction
            .open_table(TableDefinition::<u64, &[u8]>::new(&name))
            .map_err(report)?;
        let mut batches = Vec::new();
        let mut id_count = 0;
        for entry in table.iter().map_err(report)? {
            let (sequence, value) = entry.map_err(report)?;
            let ids = decode_ids(value.value())?;
            if id_count + ids.len() > max_ids && !batches.is_empty() {
                break;
            }
            id_count += ids.len();
            batches.push(DirtyBatch {
                entity_type: entity_type.clone(),
                sequence: sequence.value(),
                ids,
            });
            if id_count >= max_ids {
                break;
            }
        }
        Ok(batches)
    }

    fn clear_dirty_batches(&mut self, batches: &[DirtyBatch]) -> JoiResult<()> {
        let transaction = self.database.begin_write().map_err(report)?;
        let mut by_type: HashMap<&TableName, Vec<u64>> = HashMap::new();
        for batch in batches {
            by_type
                .entry(&batch.entity_type)
                .or_default()
                .push(batch.sequence);
        }
        for (entity_type, sequences) in by_type {
            let name = dirty_table_name(entity_type);
            let mut table = transaction
                .open_table(TableDefinition::<u64, &[u8]>::new(&name))
                .map_err(report)?;
            for sequence in sequences {
                table.remove(sequence).map_err(report)?;
            }
        }
        transaction.commit().map_err(report)
    }

    fn mutate(&mut self, mutation: EntityMutation) -> JoiResult<EntityMutationResult> {
        let transaction = self.database.begin_write().map_err(report)?;
        let mut returned = None;
        let mut dirty_batches = Vec::new();
        {
            let mut table = transaction.open_table(ENTITIES).map_err(report)?;
            let mut affected = Vec::new();
            for step in mutation.steps {
                match step {
                    EntityMutationStep::Create(entity) => {
                        let key = storage_key(&entity.entity_type, &entity.id);
                        if table.get(key.as_slice()).map_err(report)?.is_some() {
                            joi_bail!("entity already exists");
                        }
                        table
                            .insert(key.as_slice(), entity.data.as_slice())
                            .map_err(report)?;
                        affected.push(EntityKey {
                            entity_type: entity.entity_type,
                            id: entity.id,
                        });
                    }
                    EntityMutationStep::Update(entity) => {
                        let key = storage_key(&entity.entity_type, &entity.id);
                        if table.get(key.as_slice()).map_err(report)?.is_none() {
                            joi_bail!("entity does not exist");
                        }
                        table
                            .insert(key.as_slice(), entity.data.as_slice())
                            .map_err(report)?;
                        affected.push(EntityKey {
                            entity_type: entity.entity_type,
                            id: entity.id,
                        });
                    }
                    EntityMutationStep::Delete(key) => {
                        let encoded = storage_key(&key.entity_type, &key.id);
                        if table.remove(encoded.as_slice()).map_err(report)?.is_none() {
                            joi_bail!("entity does not exist");
                        }
                        affected.push(key);
                    }
                }
            }
            if mutation.return_entities {
                let mut seen = std::collections::HashSet::new();
                let mut entities = Vec::new();
                for key in &affected {
                    if !seen.insert((key.entity_type.clone(), key.id.clone())) {
                        continue;
                    }
                    let encoded = storage_key(&key.entity_type, &key.id);
                    if let Some(value) = table.get(encoded.as_slice()).map_err(report)? {
                        entities.push(Entity {
                            entity_type: key.entity_type.clone(),
                            id: key.id.clone(),
                            data: value.value().to_vec(),
                        });
                    }
                }
                returned = Some(entities);
            }
            deduplicate_keys(&mut affected);
            let mut affected_by_type: HashMap<TableName, Vec<EntityId>> = HashMap::new();
            for key in &affected {
                affected_by_type
                    .entry(key.entity_type.clone())
                    .or_default()
                    .push(key.id.clone());
            }
            for (entity_type, ids) in affected_by_type {
                for chunk in ids.chunks(DIRTY_BATCH_SIZE) {
                    let sequence = next_dirty_sequence(&transaction, &entity_type)?;
                    let name = dirty_table_name(&entity_type);
                    let mut dirty_table = transaction
                        .open_table(TableDefinition::<u64, &[u8]>::new(&name))
                        .map_err(report)?;
                    let encoded = encode_ids(chunk);
                    dirty_table
                        .insert(sequence, encoded.as_slice())
                        .map_err(report)?;
                    dirty_batches.push(DirtyBatch {
                        entity_type: entity_type.clone(),
                        sequence,
                        ids: chunk.to_vec(),
                    });
                }
            }
        }
        transaction.commit().map_err(report)?;
        Ok(EntityMutationResult {
            entities: returned,
            dirty_batches,
        })
    }
}

fn dirty_table_name(entity_type: &TableName) -> String {
    format!("{DIRTY_TABLE_PREFIX}{}", entity_type.0)
}

fn next_dirty_sequence(
    transaction: &redb::WriteTransaction,
    entity_type: &TableName,
) -> JoiResult<u64> {
    let mut table = transaction.open_table(DIRTY_SEQUENCES).map_err(report)?;
    let key = entity_type.0.as_bytes();
    let sequence = table
        .get(key)
        .map_err(report)?
        .map_or(0, |value| value.value())
        .checked_add(1)
        .ok_or_else(|| joi_error!("dirty sequence exhausted for `{}`", entity_type.0))?;
    table.insert(key, sequence).map_err(report)?;
    Ok(sequence)
}

fn encode_ids(ids: &[EntityId]) -> Vec<u8> {
    let mut encoded = Vec::new();
    encoded.extend_from_slice(&(ids.len() as u32).to_be_bytes());
    for id in ids {
        encoded.extend_from_slice(&(id.as_bytes().len() as u32).to_be_bytes());
        encoded.extend_from_slice(id.as_bytes());
    }
    encoded
}

fn decode_ids(mut encoded: &[u8]) -> JoiResult<Vec<EntityId>> {
    let count = read_u32(&mut encoded)? as usize;
    let mut ids = Vec::with_capacity(count);
    for _ in 0..count {
        let length = read_u32(&mut encoded)? as usize;
        if encoded.len() < length {
            return Err(joi_error!("dirty batch contains a truncated entity ID"));
        }
        ids.push(EntityId::new(encoded[..length].to_vec()));
        encoded = &encoded[length..];
    }
    if !encoded.is_empty() {
        return Err(joi_error!("dirty batch contains trailing data"));
    }
    Ok(ids)
}

fn read_u32(encoded: &mut &[u8]) -> JoiResult<u32> {
    if encoded.len() < 4 {
        return Err(joi_error!("dirty batch contains a truncated length"));
    }
    let (value, remaining) = encoded.split_at(4);
    *encoded = remaining;
    Ok(u32::from_be_bytes(
        value.try_into().expect("length is four bytes"),
    ))
}

fn deduplicate_keys(keys: &mut Vec<EntityKey>) {
    let mut seen = std::collections::HashSet::new();
    keys.retain(|key| seen.insert((key.entity_type.clone(), key.id.clone())));
}

fn storage_prefix(entity_type: &TableName) -> Vec<u8> {
    let type_bytes = entity_type.0.as_bytes();
    let mut key = Vec::with_capacity(4 + type_bytes.len());
    key.extend_from_slice(&(type_bytes.len() as u32).to_be_bytes());
    key.extend_from_slice(type_bytes);
    key
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

#[cfg(test)]
mod tests {
    use crate::{
        data_store::TableName,
        entity_store::{Entity, EntityId, EntityMutation, EntityMutationStep, EntityStore},
    };

    use super::RedbEntityStore;

    #[test]
    fn stores_binary_ids_and_values() {
        let directory = tempfile::tempdir().unwrap();
        let mut store = RedbEntityStore::open(directory.path().join("entities.redb")).unwrap();
        let entity_type = TableName("tickets".into());
        let id = EntityId::new([0, 1, 0, 255]);
        store
            .create(Entity {
                entity_type: entity_type.clone(),
                id: id.clone(),
                data: vec![3, 2, 1],
            })
            .unwrap();

        assert_eq!(
            store.read(&entity_type, &id).unwrap().unwrap().data,
            [3, 2, 1]
        );
        assert_eq!(store.read_all(&entity_type).unwrap().len(), 1);
        store.delete(&entity_type, &id).unwrap();
        assert!(store.read(&entity_type, &id).unwrap().is_none());
    }

    #[test]
    fn optionally_returns_complete_mutated_entities() {
        let directory = tempfile::tempdir().unwrap();
        let mut store = RedbEntityStore::open(directory.path().join("entities.redb")).unwrap();
        let entity_type = TableName("tickets".into());
        let id = EntityId::new(b"ticket-1");

        let result = store
            .mutate(EntityMutation {
                steps: vec![EntityMutationStep::Create(Entity {
                    entity_type,
                    id,
                    data: br#"{"title":"Stored"}"#.to_vec(),
                })],
                return_entities: true,
            })
            .unwrap();

        assert_eq!(result.entities.unwrap()[0].data, br#"{"title":"Stored"}"#);
    }

    #[test]
    fn chunks_dirty_ids_in_sequence_order() {
        let directory = tempfile::tempdir().unwrap();
        let mut store = RedbEntityStore::open(directory.path().join("entities.redb")).unwrap();
        let entity_type = TableName("tickets".into());
        store
            .prepare_dirty_tables(std::slice::from_ref(&entity_type))
            .unwrap();

        let steps = (0..10_001)
            .map(|index| {
                EntityMutationStep::Create(Entity {
                    entity_type: entity_type.clone(),
                    id: EntityId::new(format!("ticket-{index}").into_bytes()),
                    data: Vec::new(),
                })
            })
            .collect();
        let result = store
            .mutate(EntityMutation {
                steps,
                return_entities: false,
            })
            .unwrap();

        assert_eq!(result.dirty_batches.len(), 2);
        assert_eq!(result.dirty_batches[0].sequence, 1);
        assert_eq!(result.dirty_batches[0].ids.len(), 10_000);
        assert_eq!(result.dirty_batches[1].sequence, 2);
        assert_eq!(result.dirty_batches[1].ids.len(), 1);

        let first = store.read_dirty_batches(&entity_type, 10_000).unwrap();
        assert_eq!(first, result.dirty_batches[..1]);
        store.clear_dirty_batches(&first).unwrap();
        assert_eq!(
            store.read_dirty_batches(&entity_type, 10_000).unwrap(),
            result.dirty_batches[1..]
        );
    }
}
