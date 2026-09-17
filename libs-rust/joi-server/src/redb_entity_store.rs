use std::path::Path;

use joi_error::{JoiResult, joi_bail, report};
use redb::{Database, ReadableDatabase, ReadableTable, TableDefinition};

use crate::{
    data_store::TableName,
    entity_store::{
        Entity, EntityId, EntityKey, EntityMutation, EntityMutationResult, EntityMutationStep,
        EntityStore,
    },
};

const ENTITIES: TableDefinition<&[u8], &[u8]> = TableDefinition::new("entities");

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
        write.commit().map_err(report)?;
        Ok(Self { database })
    }
}

impl EntityStore for RedbEntityStore {
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

    fn mutate(&mut self, mutation: EntityMutation) -> JoiResult<EntityMutationResult> {
        let transaction = self.database.begin_write().map_err(report)?;
        let mut returned = None;
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
                for key in affected {
                    if !seen.insert((key.entity_type.clone(), key.id.clone())) {
                        continue;
                    }
                    let encoded = storage_key(&key.entity_type, &key.id);
                    if let Some(value) = table.get(encoded.as_slice()).map_err(report)? {
                        entities.push(Entity {
                            entity_type: key.entity_type,
                            id: key.id,
                            data: value.value().to_vec(),
                        });
                    }
                }
                returned = Some(entities);
            }
        }
        transaction.commit().map_err(report)?;
        Ok(EntityMutationResult { entities: returned })
    }
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
}
