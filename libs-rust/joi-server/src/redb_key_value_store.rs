use std::path::Path;

use joi_error::{JoiResult, report};
use redb::{Database, ReadableDatabase, TableDefinition};

use crate::{
    data_store::TableName,
    key_value_store::{KeyValue, KeyValueMutation, KeyValueMutations, KeyValueStore},
};

/// redb implementation of the generic [`KeyValueStore`].
pub struct RedbKeyValueStore {
    database: Database,
}

impl RedbKeyValueStore {
    /// Opens or creates a redb key/value store at `path`.
    pub fn open(path: impl AsRef<Path>) -> JoiResult<Self> {
        Ok(Self {
            database: {
                let database = Database::create(path).map_err(report)?;
                let transaction = database.begin_write().map_err(report)?;
                transaction
                    .open_table(TableDefinition::<&[u8], &[u8]>::new("entities"))
                    .map_err(report)?;
                transaction.commit().map_err(report)?;
                database
            },
        })
    }

    fn table_name(table: &TableName) -> String {
        table.0.to_string()
    }
}

impl KeyValueStore for RedbKeyValueStore {
    fn mutate(&mut self, mutations: KeyValueMutations) -> JoiResult<()> {
        let transaction = self.database.begin_write().map_err(report)?;
        for mutation in mutations.mutations {
            match mutation {
                KeyValueMutation::Set(set) => {
                    let name = Self::table_name(&set.table);
                    let mut table = transaction
                        .open_table(TableDefinition::<&[u8], &[u8]>::new(&name))
                        .map_err(report)?;
                    for entry in set.entries {
                        table
                            .insert(entry.key.as_slice(), entry.value.as_slice())
                            .map_err(report)?;
                    }
                }
                KeyValueMutation::Remove(remove) => {
                    let name = Self::table_name(&remove.table);
                    let mut table = transaction
                        .open_table(TableDefinition::<&[u8], &[u8]>::new(&name))
                        .map_err(report)?;
                    for key in remove.keys {
                        table.remove(key.as_slice()).map_err(report)?;
                    }
                }
            }
        }
        transaction.commit().map_err(report)
    }

    fn query_ids(&self, table: &TableName, ids: &[&[u8]]) -> JoiResult<Vec<KeyValue>> {
        let transaction = self.database.begin_read().map_err(report)?;
        let name = Self::table_name(table);
        let table = match transaction.open_table(TableDefinition::<&[u8], &[u8]>::new(&name)) {
            Ok(table) => table,
            Err(error) if error.to_string().contains("does not exist") => return Ok(Vec::new()),
            Err(error) => return Err(report(error)),
        };
        ids.iter()
            .filter_map(|key| match table.get(*key) {
                Ok(Some(value)) => Some(Ok(KeyValue {
                    key: key.to_vec(),
                    value: value.value().to_vec(),
                })),
                Ok(None) => None,
                Err(error) => Some(Err(report(error))),
            })
            .collect()
    }

    fn query_range(
        &self,
        table: &TableName,
        range: std::ops::Range<&[u8]>,
    ) -> JoiResult<Vec<KeyValue>> {
        let transaction = self.database.begin_read().map_err(report)?;
        let name = Self::table_name(table);
        let table = match transaction.open_table(TableDefinition::<&[u8], &[u8]>::new(&name)) {
            Ok(table) => table,
            Err(error) if error.to_string().contains("does not exist") => return Ok(Vec::new()),
            Err(error) => return Err(report(error)),
        };
        table
            .range(range)
            .map_err(report)?
            .map(|entry| {
                let (key, value) = entry.map_err(report)?;
                Ok(KeyValue {
                    key: key.value().to_vec(),
                    value: value.value().to_vec(),
                })
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::RedbKeyValueStore;
    use crate::{
        data_store::TableName,
        key_value_store::{
            KeyValue, KeyValueMutation, KeyValueMutations, KeyValueSetMutation, KeyValueStore,
        },
    };

    #[test]
    fn commits_and_queries_binary_entries() {
        let directory = tempfile::tempdir().unwrap();
        let mut store = RedbKeyValueStore::open(directory.path().join("store.redb")).unwrap();
        let table = TableName("values".into());
        store
            .mutate(KeyValueMutations {
                mutations: vec![KeyValueMutation::Set(KeyValueSetMutation {
                    table: table.clone(),
                    entries: vec![
                        KeyValue {
                            key: vec![0, 2],
                            value: vec![9],
                        },
                        KeyValue {
                            key: vec![0, 1],
                            value: vec![8],
                        },
                    ],
                })],
            })
            .unwrap();

        assert_eq!(
            store.query_ids(&table, &[&[0, 1], &[0, 3]]).unwrap(),
            vec![KeyValue {
                key: vec![0, 1],
                value: vec![8]
            }]
        );
        assert_eq!(store.query_range(&table, &[0]..&[1]).unwrap().len(), 2);
    }

    #[test]
    fn missing_tables_are_empty() {
        let directory = tempfile::tempdir().unwrap();
        let store = RedbKeyValueStore::open(directory.path().join("store.redb")).unwrap();
        assert!(
            store
                .query_range(&TableName("missing".into()), &[]..&[u8::MAX])
                .unwrap()
                .is_empty()
        );
    }
}
