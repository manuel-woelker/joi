//! Human-readable aliases for entities whose immutable IDs are not suitable for URLs.

use joi_base::JoiString;
use joi_error::{JoiResult, joi_bail, joi_error};

use crate::{
    command_handler::{CommandContext, CommandHandler},
    data_store::{
        AttributeColumn, AttributeName, ColumnDataType, ColumnDescription, DataStore,
        DataStoreInsertMutation, DataStoreMutation, DataStoreMutationStep, DataStoreQuery,
        QueryCriterion, SharedDataStore, TableDescription, TableDescriptionProvider, TableName,
        Values,
    },
    generated::api::{EntityKeyResolveRequest, EntityKeyResolveResponse},
    mutation_contributor::MutationContext,
};

const TABLE: &str = "entity_keys";

/// One namespace-scoped alias pointing at a canonical entity type and ID.
pub struct EntityKey {
    /// Alias namespace, for example `wiki`.
    pub namespace: JoiString,
    /// Human-readable key within the namespace.
    pub key: JoiString,
    /// Canonical entity table, for example `wikipages`.
    pub entity_type: JoiString,
    /// Immutable ID of the target entity.
    pub entity_id: JoiString,
}

/// Hidden table used for namespace-scoped aliases.
pub struct EntityKeysTable;

impl TableDescriptionProvider for EntityKeysTable {
    fn table_description(&self) -> TableDescription {
        TableDescription {
            name: TableName(TABLE.into()),
            discoverable: false,
            presentation: None,
            columns: ["id", "entity_type", "entity_id"]
                .map(|name| ColumnDescription {
                    name: AttributeName(name.into()),
                    description: format!("Entity alias {name}").into(),
                    data_type: ColumnDataType::String,
                    optional: false,
                })
                .into_iter()
                .collect(),
        }
    }
}

/// Resolves an alias without changing its target.
pub fn find_entity_key(
    store: &dyn DataStore,
    namespace: &str,
    key: &str,
) -> JoiResult<Option<EntityKey>> {
    let id = alias_id(namespace, key)?;
    let result = store.query(DataStoreQuery {
        table_name: TableName(TABLE.into()),
        criterion: QueryCriterion::Equals {
            attribute: AttributeName("id".into()),
            values: vec![id.into()],
        },
        sorting: vec![],
        max_results: 2,
        attributes: ["entity_type", "entity_id"]
            .map(|name| AttributeName(name.into()))
            .to_vec(),
    })?;
    if result.number_of_hits > 1 {
        joi_bail!("entity alias `{namespace}:{key}` is duplicated");
    }
    if result.number_of_hits == 0 {
        return Ok(None);
    }
    let value = |index: usize| -> JoiResult<JoiString> {
        match &result.result_columns[index].values {
            Values::String(values) => values
                .first()
                .cloned()
                .ok_or_else(|| joi_error!("entity alias has a missing value")),
            _ => Err(joi_error!("entity alias has an invalid value")),
        }
    };
    Ok(Some(EntityKey {
        namespace: namespace.into(),
        key: key.into(),
        entity_type: value(0)?,
        entity_id: value(1)?,
    }))
}

/// Registers an alias once; repeated registration of the same target is harmless.
pub fn register_entity_key(store: &mut dyn DataStore, entry: &EntityKey) -> JoiResult<()> {
    let id = alias_id(&entry.namespace, &entry.key)?;
    if entry.entity_type.is_empty() || entry.entity_id.is_empty() {
        joi_bail!("entity alias target must not be empty");
    }
    if let Some(existing) = find_entity_key(store, &entry.namespace, &entry.key)? {
        if existing.entity_type == entry.entity_type && existing.entity_id == entry.entity_id {
            return Ok(());
        }
        joi_bail!("entity alias `{id}` already points to a different entity");
    }
    store.mutate(
        &MutationContext::system(),
        DataStoreMutation {
            steps: vec![DataStoreMutationStep::Insert(DataStoreInsertMutation {
                table_name: TableName(TABLE.into()),
                columns: [
                    ("id", id),
                    ("entity_type", entry.entity_type.to_string()),
                    ("entity_id", entry.entity_id.to_string()),
                ]
                .map(|(name, value)| AttributeColumn {
                    attribute: AttributeName(name.into()),
                    values: Values::String(vec![value.into()]),
                })
                .into_iter()
                .collect(),
            })],
            return_entities: false,
        },
    )?;
    Ok(())
}

fn alias_id(namespace: &str, key: &str) -> JoiResult<String> {
    if namespace.is_empty() || namespace.contains(':') || key.is_empty() {
        joi_bail!("entity aliases require a namespace without ':' and a nonempty key");
    }
    Ok(format!("{namespace}:{key}"))
}

/// Looks up alias targets for the UI and other clients.
pub struct ResolveEntityKeyCommand {
    store: SharedDataStore,
}

impl ResolveEntityKeyCommand {
    /// Creates a resolver backed by the shared data store.
    pub fn new(store: SharedDataStore) -> Self {
        Self { store }
    }
}

impl CommandHandler for ResolveEntityKeyCommand {
    type Command = EntityKeyResolveRequest;

    fn execute(
        &self,
        context: &CommandContext,
        request: EntityKeyResolveRequest,
    ) -> JoiResult<EntityKeyResolveResponse> {
        context.require_user()?;
        let store = self
            .store
            .lock()
            .map_err(|_| joi_error!("data store lock is poisoned"))?;
        let entry = find_entity_key(store.as_ref(), &request.namespace, &request.key)?;
        Ok(match entry {
            Some(entry) => EntityKeyResolveResponse {
                found: true,
                entity_type: entry.entity_type.to_string(),
                entity_id: entry.entity_id.to_string(),
            },
            None => EntityKeyResolveResponse {
                found: false,
                entity_type: String::new(),
                entity_id: String::new(),
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::IndexedDataStore;

    #[test]
    fn aliases_are_namespace_scoped_idempotent_and_not_reassigned() {
        let mut store = IndexedDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![EntityKeysTable.table_description()])
            .unwrap();
        let first = EntityKey {
            namespace: "wiki".into(),
            key: "Start".into(),
            entity_type: "wikipages".into(),
            entity_id: "page-1".into(),
        };
        register_entity_key(&mut store, &first).unwrap();
        register_entity_key(&mut store, &first).unwrap();
        assert_eq!(
            find_entity_key(&store, "wiki", "Start")
                .unwrap()
                .unwrap()
                .entity_id,
            "page-1"
        );
        assert!(find_entity_key(&store, "other", "Start").unwrap().is_none());
        let replacement = EntityKey {
            entity_id: "page-2".into(),
            ..first
        };
        assert!(register_entity_key(&mut store, &replacement).is_err());
        assert!(
            find_entity_key(&store, "wiki", "Start:More")
                .unwrap()
                .is_none()
        );
    }
}
