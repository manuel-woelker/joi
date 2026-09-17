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
    entity_store::{Entity, EntityId, EntityKey, EntityMutation, EntityMutationStep, EntityStore},
    redb_entity_store::RedbEntityStore,
    search_index::SearchIndex,
    tantivy_search_index::TantivySearchIndex,
};

/// Coordinates authoritative entity storage with a derived search index.
pub struct IndexedDataStore {
    entity_store: Box<dyn EntityStore>,
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
            entity_store: Box::new(RedbEntityStore::open(entity_store_path)?),
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
        entity_store: Box<dyn EntityStore>,
        search_index: Box<dyn SearchIndex>,
    ) -> Self {
        Self {
            entity_store,
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
        self.search_index.prepare(tables)?;
        for entity_type in schemas.keys() {
            let entities = self.entity_store.read_all(entity_type)?;
            self.search_index.rebuild(entity_type, &entities)?;
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
        let result = self.entity_store.mutate(EntityMutation {
            steps,
            return_entities: true,
        })?;

        let changed = result.entities.unwrap_or_default();
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
        Ok(DataStoreMutationResult {
            entities: return_entities.then_some(changed),
        })
    }
}

impl IndexedDataStore {
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
                        if current_entity(self.entity_store.as_ref(), &staged, &key)?.is_some() {
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
                        let mut entity = current_entity(self.entity_store.as_ref(), &staged, &key)?
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
                        if current_entity(self.entity_store.as_ref(), &staged, &key)?.is_none() {
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
            if current_entity(self.entity_store.as_ref(), staged, &key)?.is_none() {
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
    store: &dyn EntityStore,
    staged: &HashMap<(TableName, EntityId), Option<Entity>>,
    key: &(TableName, EntityId),
) -> JoiResult<Option<Entity>> {
    staged
        .get(key)
        .cloned()
        .map_or_else(|| store.read(&key.0, &key.1), Ok)
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
