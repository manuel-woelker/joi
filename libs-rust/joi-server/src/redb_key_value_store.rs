use std::{ops::Bound, path::Path};

use joi_error::{JoiResult, report};
use redb::{Database, ReadableDatabase, ReadableTable, TableDefinition};

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
            database: Database::create(path).map_err(report)?,
        })
    }

    fn table_name(table: &TableName) -> String {
        table.0.to_string()
    }
}

impl KeyValueStore for RedbKeyValueStore {
    fn mutate(&mut self, mutations: KeyValueMutations<'_>) -> JoiResult<()> {
        let transaction = self.database.begin_write().map_err(report)?;
        for mutation in mutations.mutations {
            match mutation {
                KeyValueMutation::Set(set) => {
                    let name = Self::table_name(&set.table);
                    let mut table = transaction
                        .open_table(TableDefinition::<&[u8], &[u8]>::new(&name))
                        .map_err(report)?;
                    for entry in &set.entries {
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
                    for key in &remove.keys {
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

    fn query_page(
        &self,
        table: &TableName,
        after: Option<&[u8]>,
        limit: usize,
    ) -> JoiResult<Vec<KeyValue>> {
        debug_assert!(limit > 0, "paged scans need a nonzero page size");
        let transaction = self.database.begin_read().map_err(report)?;
        let name = Self::table_name(table);
        let table = match transaction.open_table(TableDefinition::<&[u8], &[u8]>::new(&name)) {
            Ok(table) => table,
            Err(error) if error.to_string().contains("does not exist") => return Ok(Vec::new()),
            Err(error) => return Err(report(error)),
        };
        let lower = after.map_or(Bound::Unbounded, Bound::Excluded);
        table
            .range::<&[u8]>((lower, Bound::Unbounded))
            .map_err(report)?
            .take(limit)
            .map(|entry| {
                let (key, value) = entry.map_err(report)?;
                Ok(KeyValue {
                    key: key.value().to_vec(),
                    value: value.value().to_vec(),
                })
            })
            .collect()
    }

    fn query_oldest(&self, table: &TableName) -> JoiResult<Option<KeyValue>> {
        let transaction = self.database.begin_read().map_err(report)?;
        let name = Self::table_name(table);
        let table = match transaction.open_table(TableDefinition::<&[u8], &[u8]>::new(&name)) {
            Ok(table) => table,
            Err(error) if error.to_string().contains("does not exist") => return Ok(None),
            Err(error) => return Err(report(error)),
        };
        let entry = table.first().map_err(report)?;
        Ok(entry.map(|(key, value)| KeyValue {
            key: key.value().to_vec(),
            value: value.value().to_vec(),
        }))
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
        let mutations = vec![KeyValueMutation::Set(KeyValueSetMutation {
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
        })];
        store
            .mutate(KeyValueMutations {
                mutations: &mutations,
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
        assert!(
            store
                .query_oldest(&TableName("missing".into()))
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn oldest_returns_the_smallest_key() {
        let directory = tempfile::tempdir().unwrap();
        let mut store = RedbKeyValueStore::open(directory.path().join("store.redb")).unwrap();
        let table = TableName("values".into());
        let mutations = vec![KeyValueMutation::Set(KeyValueSetMutation {
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
        })];
        store
            .mutate(KeyValueMutations {
                mutations: &mutations,
            })
            .unwrap();

        assert_eq!(
            store.query_oldest(&table).unwrap(),
            Some(KeyValue {
                key: vec![0, 1],
                value: vec![8]
            })
        );
    }

    #[test]
    fn pages_walk_a_table_without_gaps_or_repeats() {
        let directory = tempfile::tempdir().unwrap();
        let mut store = RedbKeyValueStore::open(directory.path().join("store.redb")).unwrap();
        let table = TableName("values".into());
        let mutations = vec![KeyValueMutation::Set(KeyValueSetMutation {
            table: table.clone(),
            entries: vec![
                KeyValue {
                    key: vec![0, 3],
                    value: vec![3],
                },
                KeyValue {
                    key: vec![0, 1],
                    value: vec![1],
                },
                KeyValue {
                    key: vec![0, 2],
                    value: vec![2],
                },
            ],
        })];
        store
            .mutate(KeyValueMutations {
                mutations: &mutations,
            })
            .unwrap();

        let first = store.query_page(&table, None, 2).unwrap();
        assert_eq!(
            first
                .iter()
                .map(|entry| entry.key.clone())
                .collect::<Vec<_>>(),
            vec![vec![0, 1], vec![0, 2]]
        );
        let second = store.query_page(&table, Some(&first[1].key), 2).unwrap();
        assert_eq!(
            second
                .iter()
                .map(|entry| entry.key.clone())
                .collect::<Vec<_>>(),
            vec![vec![0, 3]]
        );
        assert!(
            store
                .query_page(&table, Some(&second[0].key), 2)
                .unwrap()
                .is_empty()
        );
        assert!(
            store
                .query_page(&TableName("missing".into()), None, 2)
                .unwrap()
                .is_empty()
        );
    }
}
