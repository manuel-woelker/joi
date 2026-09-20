use std::{
    cmp::Ordering,
    collections::{HashMap, HashSet},
    fs,
    ops::Bound,
    path::{Path, PathBuf},
};

use joi_base::JoiString;
use joi_error::{JoiResult, joi_bail, joi_error, report};
use serde_json::{Map, Value as JsonValue};
use tantivy::{
    Index, IndexReader, Order, ReloadPolicy, TantivyDocument, Term,
    aggregation::{AggregationCollector, agg_req::Aggregations},
    collector::{Count, TopDocs},
    doc,
    query::{
        AllQuery, BooleanQuery, EmptyQuery, ExistsQuery, FastFieldRangeQuery, Occur, PhraseQuery,
        Query, RegexQuery, TermQuery,
    },
    schema::{FAST, Field, IndexRecordOption, STORED, STRING, Schema, TEXT, Value},
};

use crate::{
    Entity,
    data_store::{
        AttributeColumn, AttributeName, ColumnDataType, DataStoreCountValue, DataStoreQuery,
        DataStoreQueryResult, DataStoreValue, QueryCriterion, QuerySortDirection, TableDescription,
        TableName, Values,
    },
    entity_store::EntityId,
    search_index::SearchIndex,
};

const ENTITY_ID_FIELD: &str = "_joi_entity_id";
const ENTITY_DATA_FIELD: &str = "_joi_entity_data";
const SEQUENCE_FIELD: &str = "_joi_sequence";
const LOWER_SUFFIX: &str = "_joi_lower";
const TOKEN_SUFFIX: &str = "_joi_token";
const SORT_SUFFIX: &str = "_joi_sort";
/// Tokenizer backing quicksearch: tantivy's native word-token search over a
/// tokenized text field.
const TOKENIZER: &str = "default";
/// Search-index schema generation. Bump after any index-layout change; older
/// on-disk indexes are derived data and rebuild from the entity store.
const SCHEMA_VERSION: &str = "5";
const SCHEMA_VERSION_FILE: &str = "joi_schema_version";
/// Sort keys keep a short prefix: enough to order records, small to store.
const SORT_PREFIX_CHARS: usize = 32;

struct IndexedAttribute {
    field: Field,
    lower_field: Option<Field>,
    token_field: Option<Field>,
    sort_field: Option<Field>,
    data_type: ColumnDataType,
}

struct EntityIndex {
    index: Index,
    reader: IndexReader,
    id_field: Field,
    data_field: Field,
    sequence_field: Field,
    attributes: HashMap<AttributeName, IndexedAttribute>,
    attribute_order: Vec<AttributeName>,
    next_sequence: u64,
    sequences: HashMap<EntityId, u64>,
}

/// Tantivy-backed secondary index for entity rows and aggregations.
pub struct TantivySearchIndex {
    root: PathBuf,
    indexes: HashMap<TableName, EntityIndex>,
}

impl TantivySearchIndex {
    /// Opens or creates a derived index at `path`.
    pub fn open(path: impl AsRef<Path>) -> JoiResult<Self> {
        let root = path.as_ref().to_path_buf();
        fs::create_dir_all(&root).map_err(report)?;
        ensure_schema_version(&root)?;
        Ok(Self {
            root,
            indexes: HashMap::new(),
        })
    }

    fn entity_index(&self, entity_type: &TableName) -> JoiResult<&EntityIndex> {
        self.indexes.get(entity_type).ok_or_else(|| {
            joi_error!(
                "entity type `{}` is not registered in the search index",
                entity_type.0
            )
        })
    }

    fn entity_index_mut(&mut self, entity_type: &TableName) -> JoiResult<&mut EntityIndex> {
        self.indexes.get_mut(entity_type).ok_or_else(|| {
            joi_error!(
                "entity type `{}` is not registered in the search index",
                entity_type.0
            )
        })
    }
}

impl SearchIndex for TantivySearchIndex {
    fn prepare(&mut self, tables: Vec<TableDescription>) -> JoiResult<()> {
        if !self.indexes.is_empty() {
            joi_bail!("search index schemas have already been prepared");
        }
        for table in tables {
            validate_table(&table)?;
            let directory = self.root.join(hex(table.name.0.as_bytes()));
            fs::create_dir_all(&directory).map_err(report)?;
            let (index, schema) = if directory.join("meta.json").exists() {
                let index = Index::open_in_dir(&directory).map_err(report)?;
                let schema = index.schema();
                (index, schema)
            } else {
                let mut schema = Schema::builder();
                schema.add_text_field(ENTITY_ID_FIELD, STRING | STORED);
                schema.add_bytes_field(ENTITY_DATA_FIELD, STORED);
                schema.add_u64_field(SEQUENCE_FIELD, FAST | STORED);
                for column in &table.columns {
                    let name = column.name.0.as_str();
                    match column.data_type {
                        ColumnDataType::String => {
                            schema.add_text_field(name, STRING | STORED | FAST);
                            schema.add_text_field(&format!("{name}{LOWER_SUFFIX}"), STRING);
                            schema.add_text_field(&format!("{name}{TOKEN_SUFFIX}"), TEXT);
                        }
                        // Prose is only indexed as tokenized text; row values
                        // come from the stored entity payload. A truncated
                        // sort key keeps ordering cheap.
                        ColumnDataType::Text => {
                            schema.add_text_field(name, TEXT);
                            schema.add_text_field(&format!("{name}{SORT_SUFFIX}"), STRING | FAST);
                        }
                        ColumnDataType::Int => {
                            schema.add_i64_field(name, tantivy::schema::INDEXED | STORED | FAST);
                        }
                    };
                }
                let schema = schema.build();
                let index = Index::create_in_dir(&directory, schema.clone()).map_err(report)?;
                (index, schema)
            };
            let id_field = schema.get_field(ENTITY_ID_FIELD).map_err(report)?;
            let data_field = schema.get_field(ENTITY_DATA_FIELD).map_err(report)?;
            let sequence_field = schema.get_field(SEQUENCE_FIELD).map_err(report)?;
            let mut attributes = HashMap::new();
            let mut attribute_order = Vec::with_capacity(table.columns.len());
            for column in table.columns {
                let name = column.name.0.as_str();
                let (field, lower_field, token_field, sort_field) = match column.data_type {
                    ColumnDataType::String => {
                        let lower_name = format!("{name}{LOWER_SUFFIX}");
                        let token_name = format!("{name}{TOKEN_SUFFIX}");
                        (
                            schema.get_field(name).map_err(report)?,
                            Some(schema.get_field(&lower_name).map_err(report)?),
                            Some(schema.get_field(&token_name).map_err(report)?),
                            None,
                        )
                    }
                    ColumnDataType::Text => {
                        let sort_name = format!("{name}{SORT_SUFFIX}");
                        (
                            schema.get_field(name).map_err(report)?,
                            None,
                            None,
                            Some(schema.get_field(&sort_name).map_err(report)?),
                        )
                    }
                    ColumnDataType::Int => {
                        (schema.get_field(name).map_err(report)?, None, None, None)
                    }
                };
                attribute_order.push(column.name.clone());
                attributes.insert(
                    column.name,
                    IndexedAttribute {
                        field,
                        lower_field,
                        token_field,
                        sort_field,
                        data_type: column.data_type,
                    },
                );
            }
            let reader = index
                .reader_builder()
                .reload_policy(ReloadPolicy::Manual)
                .try_into()
                .map_err(report)?;
            self.indexes.insert(
                table.name,
                EntityIndex {
                    index,
                    reader,
                    id_field,
                    data_field,
                    sequence_field,
                    attributes,
                    attribute_order,
                    next_sequence: 0,
                    sequences: HashMap::new(),
                },
            );
        }
        Ok(())
    }

    fn is_empty(&self, entity_type: &TableName) -> JoiResult<bool> {
        Ok(self.entity_index(entity_type)?.reader.searcher().num_docs() == 0)
    }

    fn rebuild(&mut self, entity_type: &TableName, entities: &[Entity]) -> JoiResult<()> {
        let index = self.entity_index_mut(entity_type)?;
        let mut writer = index.index.writer(50_000_000).map_err(report)?;
        writer.delete_all_documents().map_err(report)?;
        index.next_sequence = 0;
        index.sequences.clear();
        for entity in entities {
            add_entity(index, &mut writer, entity)?;
        }
        writer.commit().map_err(report)?;
        index.reader.reload().map_err(report)
    }

    fn upsert(&mut self, entities: &[Entity]) -> JoiResult<()> {
        let mut by_type: HashMap<TableName, Vec<&Entity>> = HashMap::new();
        for entity in entities {
            by_type
                .entry(entity.entity_type.clone())
                .or_default()
                .push(entity);
        }
        for (entity_type, entities) in by_type {
            let index = self.entity_index_mut(&entity_type)?;
            let mut writer = index.index.writer(50_000_000).map_err(report)?;
            for entity in entities {
                writer.delete_term(Term::from_field_text(
                    index.id_field,
                    &hex(entity.id.as_bytes()),
                ));
                add_entity(index, &mut writer, entity)?;
            }
            writer.commit().map_err(report)?;
            index.reader.reload().map_err(report)?;
        }
        Ok(())
    }

    fn delete(&mut self, entity_type: &TableName, ids: &[EntityId]) -> JoiResult<()> {
        if ids.is_empty() {
            return Ok(());
        }
        let index = self.entity_index_mut(entity_type)?;
        let mut writer = index
            .index
            .writer::<TantivyDocument>(50_000_000)
            .map_err(report)?;
        for id in ids {
            writer.delete_term(Term::from_field_text(index.id_field, &hex(id.as_bytes())));
            index.sequences.remove(id);
        }
        writer.commit().map_err(report)?;
        index.reader.reload().map_err(report)
    }

    fn query_rows(&self, query: DataStoreQuery) -> JoiResult<DataStoreQueryResult> {
        let index = self.entity_index(&query.table_name)?;
        let tantivy_query = criterion_query(index, &query.criterion)?;
        let searcher = index.reader.searcher();
        if query.max_results == 0 && query.attributes.is_empty() && query.sorting.is_empty() {
            return Ok(DataStoreQueryResult {
                number_of_hits: searcher
                    .search(tantivy_query.as_ref(), &Count)
                    .map_err(report)?,
                result_columns: Vec::new(),
            });
        }
        let number_of_hits = searcher
            .search(tantivy_query.as_ref(), &Count)
            .map_err(report)?;
        let addresses = if let Some(sort) = query.sorting.first() {
            let field = indexed_attribute(index, &sort.attribute)?;
            // Prose orders by its truncated sort key.
            let sort_field = match field.data_type {
                ColumnDataType::Text => field.sort_field.expect("text attributes index sort keys"),
                _ => field.field,
            };
            let field_name = index.index.schema().get_field_name(sort_field).to_owned();
            // TopDocs returns the requested order directly.
            let order = match sort.direction {
                QuerySortDirection::Ascending => Order::Asc,
                QuerySortDirection::Descending => Order::Desc,
            };
            match field.data_type {
                ColumnDataType::String | ColumnDataType::Text => searcher
                    .search(
                        tantivy_query.as_ref(),
                        &TopDocs::with_limit(query.max_results.max(1))
                            .order_by_string_fast_field(field_name, order),
                    )
                    .map_err(report)?
                    .into_iter()
                    .map(|(_, address)| address)
                    .collect::<Vec<_>>(),
                ColumnDataType::Int => searcher
                    .search(
                        tantivy_query.as_ref(),
                        &TopDocs::with_limit(query.max_results.max(1))
                            .order_by_fast_field::<i64>(field_name, order),
                    )
                    .map_err(report)?
                    .into_iter()
                    .map(|(_, address)| address)
                    .collect::<Vec<_>>(),
            }
        } else {
            searcher
                .search(
                    tantivy_query.as_ref(),
                    &TopDocs::with_limit(query.max_results.max(1))
                        .order_by_fast_field::<u64>(SEQUENCE_FIELD, Order::Desc),
                )
                .map_err(report)?
                .into_iter()
                .map(|(_, address)| address)
                .collect()
        };
        let mut rows = addresses
            .into_iter()
            .map(|address| {
                let document: TantivyDocument = searcher.doc(address).map_err(report)?;
                let sequence = document
                    .get_first(index.sequence_field)
                    .and_then(|value| value.as_u64())
                    .ok_or_else(|| joi_error!("indexed entity has no sequence"))?;
                let data = document
                    .get_first(index.data_field)
                    .and_then(|value| value.as_bytes())
                    .ok_or_else(|| joi_error!("indexed entity has no payload"))?;
                let object =
                    serde_json::from_slice::<Map<String, JsonValue>>(data).map_err(report)?;
                Ok((sequence, object))
            })
            .collect::<JoiResult<Vec<_>>>()?;
        if query.sorting.len() > 1 {
            rows.sort_by(|left, right| compare_rows(left, right, &query.sorting[1..]));
        }
        rows.truncate(query.max_results);

        let attributes = if query.attributes.len() == 1 && query.attributes[0].0 == "*" {
            index.attribute_order.clone()
        } else {
            query.attributes
        };
        let mut result_columns = Vec::with_capacity(attributes.len());
        for attribute in attributes {
            let indexed = index.attributes.get(&attribute).ok_or_else(|| {
                joi_error!(
                    "entity type `{}` has no attribute `{}`",
                    query.table_name.0,
                    attribute.0
                )
            })?;
            let values = match indexed.data_type {
                // Text is physically stored as strings in the entity payload.
                ColumnDataType::String | ColumnDataType::Text => Values::String(
                    rows.iter()
                        .map(|(_, row)| {
                            row.get(attribute.0.as_str())
                                .and_then(JsonValue::as_str)
                                .unwrap_or_default()
                                .into()
                        })
                        .collect(),
                ),
                ColumnDataType::Int => Values::Int(
                    rows.iter()
                        .map(|(_, row)| {
                            row.get(attribute.0.as_str())
                                .and_then(JsonValue::as_i64)
                                .unwrap_or_default()
                        })
                        .collect(),
                ),
            };
            result_columns.push(AttributeColumn { attribute, values });
        }
        Ok(DataStoreQueryResult {
            number_of_hits,
            result_columns,
        })
    }

    fn count(
        &self,
        entity_type: &TableName,
        criterion: &QueryCriterion,
        attribute: Option<&AttributeName>,
        max_results: usize,
    ) -> JoiResult<Vec<DataStoreCountValue>> {
        if max_results == 0 {
            return Ok(Vec::new());
        }
        let index = self.entity_index(entity_type)?;
        let query = criterion_query(index, criterion)?;
        let searcher = index.reader.searcher();
        let Some(attribute) = attribute else {
            return Ok(vec![DataStoreCountValue {
                value: None,
                count: searcher.search(query.as_ref(), &Count).map_err(report)?,
            }]);
        };
        let indexed = index.attributes.get(attribute).ok_or_else(|| {
            joi_error!(
                "entity type `{}` has no aggregate attribute `{}`",
                entity_type.0,
                attribute.0
            )
        })?;
        if indexed.data_type == ColumnDataType::Text {
            joi_bail!(
                "aggregations are not supported for text attribute `{}`",
                attribute.0
            );
        }
        count_terms(&searcher, query.as_ref(), index, indexed, max_results)
    }
}

/// Drops derived indexes written with an older schema generation so they
/// rebuild from the entity store, then records the current generation.
fn ensure_schema_version(root: &Path) -> JoiResult<()> {
    let marker = root.join(SCHEMA_VERSION_FILE);
    let current = fs::read_to_string(&marker)
        .ok()
        .map(|version| version.trim().to_owned());
    if current.as_deref() == Some(SCHEMA_VERSION) {
        return Ok(());
    }
    for entry in fs::read_dir(root).map_err(report)? {
        let path = entry.map_err(report)?.path();
        if path.is_dir() {
            fs::remove_dir_all(&path).map_err(report)?;
        }
    }
    fs::write(&marker, SCHEMA_VERSION).map_err(report)
}

fn count_terms(
    searcher: &tantivy::Searcher,
    query: &dyn Query,
    index: &EntityIndex,
    attribute: &IndexedAttribute,
    max_results: usize,
) -> JoiResult<Vec<DataStoreCountValue>> {
    let field_name = index
        .index
        .schema()
        .get_field_name(attribute.field)
        .to_owned();
    let request: Aggregations = serde_json::from_value(serde_json::json!({
        "values": {
            "terms": {
                "field": field_name,
                "size": max_results
            }
        }
    }))
    .map_err(report)?;
    let collector =
        AggregationCollector::from_aggs(request, tantivy::aggregation::AggContextParams::default());
    let result = searcher.search(query, &collector).map_err(report)?;
    let json = serde_json::to_value(result).map_err(report)?;
    let buckets = json
        .get("values")
        .and_then(|value| value.get("buckets"))
        .and_then(JsonValue::as_array)
        .ok_or_else(|| joi_error!("Tantivy returned an invalid terms aggregation"))?;
    buckets
        .iter()
        .map(|bucket| {
            Ok(DataStoreCountValue {
                value: Some(match attribute.data_type {
                    ColumnDataType::String => DataStoreValue::String(
                        bucket
                            .get("key")
                            .and_then(JsonValue::as_str)
                            .ok_or_else(|| joi_error!("Tantivy returned an invalid term bucket"))?
                            .into(),
                    ),
                    ColumnDataType::Int => DataStoreValue::Int(
                        bucket
                            .get("key")
                            .and_then(JsonValue::as_i64)
                            .ok_or_else(|| {
                                joi_error!("Tantivy returned an invalid integer bucket")
                            })?,
                    ),
                    // Rejected in `count` before aggregating.
                    ColumnDataType::Text => {
                        return Err(joi_error!(
                            "aggregations are not supported for text attributes"
                        ));
                    }
                }),
                count: bucket
                    .get("doc_count")
                    .and_then(JsonValue::as_u64)
                    .ok_or_else(|| joi_error!("Tantivy returned an invalid term count"))?
                    as usize,
            })
        })
        .collect()
}

fn validate_table(table: &TableDescription) -> JoiResult<()> {
    if table.columns.is_empty() {
        joi_bail!(
            "entity type `{}` must define at least one attribute",
            table.name.0
        );
    }
    let mut names = HashSet::new();
    for column in &table.columns {
        if !names.insert(&column.name) {
            joi_bail!(
                "entity type `{}` defines duplicate attributes",
                table.name.0
            );
        }
        if column.name.0.starts_with("_joi_")
            || column.name.0.ends_with(LOWER_SUFFIX)
            || column.name.0.ends_with(TOKEN_SUFFIX)
            || column.name.0.ends_with(SORT_SUFFIX)
        {
            joi_bail!(
                "attribute `{}` uses a reserved search-index name",
                column.name.0
            );
        }
    }
    Ok(())
}

fn add_entity(
    index: &mut EntityIndex,
    writer: &mut tantivy::IndexWriter,
    entity: &Entity,
) -> JoiResult<()> {
    let object = serde_json::from_slice::<Map<String, JsonValue>>(&entity.data).map_err(report)?;
    let sequence = if let Some(sequence) = index.sequences.get(&entity.id) {
        *sequence
    } else {
        let sequence = index.next_sequence;
        index.next_sequence += 1;
        index.sequences.insert(entity.id.clone(), sequence);
        sequence
    };
    let mut document = doc!(
        index.id_field => hex(entity.id.as_bytes()),
        index.data_field => entity.data.clone(),
        index.sequence_field => sequence,
    );
    for (name, attribute) in &index.attributes {
        let Some(value) = object.get(name.0.as_str()) else {
            continue;
        };
        match attribute.data_type {
            ColumnDataType::String => {
                if let Some(value) = value.as_str() {
                    document.add_text(attribute.field, value);
                    document.add_text(attribute.lower_field.unwrap(), value.to_lowercase());
                    document.add_text(
                        attribute
                            .token_field
                            .expect("string attributes index tokens"),
                        value,
                    );
                }
            }
            ColumnDataType::Int => {
                if let Some(value) = value.as_i64() {
                    document.add_i64(attribute.field, value);
                }
            }
            // The analyzer tokenizes prose; the raw value stays in the payload.
            // The sort key is a lowercased prefix for case-insensitive order.
            ColumnDataType::Text => {
                if let Some(value) = value.as_str() {
                    document.add_text(attribute.field, value);
                    document.add_text(
                        attribute
                            .sort_field
                            .expect("text attributes index sort keys"),
                        sort_key(value),
                    );
                }
            }
        }
    }
    writer.add_document(document).map_err(report)?;
    Ok(())
}

fn criterion_query(index: &EntityIndex, criterion: &QueryCriterion) -> JoiResult<Box<dyn Query>> {
    match criterion {
        QueryCriterion::MatchAny => Ok(Box::new(AllQuery)),
        QueryCriterion::All(criteria) => composite_query(index, criteria, Occur::Must, true),
        QueryCriterion::One(criteria) => composite_query(index, criteria, Occur::Should, false),
        QueryCriterion::None(criteria) => {
            let mut clauses = vec![(Occur::Must, Box::new(AllQuery) as Box<dyn Query>)];
            for criterion in criteria {
                clauses.push((Occur::MustNot, criterion_query(index, criterion)?));
            }
            Ok(Box::new(BooleanQuery::new(clauses)))
        }
        QueryCriterion::Not(criterion) => Ok(Box::new(BooleanQuery::new(vec![
            (Occur::Must, Box::new(AllQuery)),
            (Occur::MustNot, criterion_query(index, criterion)?),
        ]))),
        QueryCriterion::Equals { attribute, values } => {
            if values.is_empty() {
                return Ok(Box::new(EmptyQuery));
            }
            let field = indexed_attribute(index, attribute)?;
            if field.data_type == ColumnDataType::Text {
                // Prose has no exact terms: every word of each value must occur.
                let mut clauses = Vec::with_capacity(values.len());
                for value in values {
                    let tokens = tokenize(index, value.as_str());
                    if tokens.is_empty() {
                        continue;
                    }
                    clauses.push((Occur::Should, token_conjunction(field.field, &tokens)));
                }
                if clauses.is_empty() {
                    return Ok(Box::new(EmptyQuery));
                }
                return Ok(Box::new(BooleanQuery::new(clauses)));
            }
            let mut clauses = Vec::with_capacity(values.len());
            for value in values {
                clauses.push((Occur::Should, exact_query(field, value)?));
            }
            Ok(Box::new(BooleanQuery::new(clauses)))
        }
        QueryCriterion::LessThan { attribute, value } => {
            let field = indexed_attribute(index, attribute)?;
            if field.data_type == ColumnDataType::Text {
                joi_bail!(
                    "less-than is not supported for text attribute `{}`",
                    attribute.0
                );
            }
            range_query(field, Bound::Unbounded, Bound::Excluded(value))
        }
        QueryCriterion::Set(attribute) => {
            let field = indexed_attribute(index, attribute)?;
            let exists = Box::new(ExistsQuery::new(field_name(index, attribute)?, false));
            if field.data_type == ColumnDataType::String {
                Ok(Box::new(BooleanQuery::new(vec![
                    (Occur::Must, exists),
                    (Occur::MustNot, exact_query(field, "")?),
                ])))
            } else {
                Ok(exists)
            }
        }
        QueryCriterion::Unset(attribute) => {
            let field = indexed_attribute(index, attribute)?;
            let missing = Box::new(BooleanQuery::new(vec![
                (Occur::Must, Box::new(AllQuery)),
                (
                    Occur::MustNot,
                    Box::new(ExistsQuery::new(field_name(index, attribute)?, false)),
                ),
            ]));
            if field.data_type == ColumnDataType::String {
                Ok(Box::new(BooleanQuery::new(vec![
                    (Occur::Should, missing),
                    (Occur::Should, exact_query(field, "")?),
                ])))
            } else {
                Ok(missing)
            }
        }
        QueryCriterion::InRange {
            attribute,
            minimum,
            maximum,
        } => {
            let field = indexed_attribute(index, attribute)?;
            if field.data_type == ColumnDataType::Text {
                joi_bail!(
                    "ranges are not supported for text attribute `{}`",
                    attribute.0
                );
            }
            range_query(
                field,
                minimum.as_ref().map_or(Bound::Unbounded, Bound::Included),
                maximum.as_ref().map_or(Bound::Unbounded, Bound::Included),
            )
        }
        QueryCriterion::Contains { attribute, value } => {
            let field = indexed_attribute(index, attribute)?;
            if field.data_type == ColumnDataType::Text {
                // Prose matches whole words: one token queries directly, longer
                // input must occur as an exact phrase.
                let tokens = tokenize(index, value.as_str());
                if tokens.is_empty() {
                    if value.as_str().is_empty() {
                        return Ok(Box::new(AllQuery));
                    }
                    return Ok(Box::new(EmptyQuery));
                }
                if tokens.len() == 1 {
                    return Ok(Box::new(TermQuery::new(
                        Term::from_field_text(field.field, &tokens[0]),
                        IndexRecordOption::Basic,
                    )));
                }
                return Ok(Box::new(PhraseQuery::new(
                    tokens
                        .iter()
                        .map(|token| Term::from_field_text(field.field, token))
                        .collect(),
                )));
            }
            let Some(lower_field) = field.lower_field else {
                joi_bail!("contains is only supported for string attributes");
            };
            // Rich-text descriptions commonly contain newlines. Enable dot-all so a
            // substring match is not limited to the current line of the raw field.
            let pattern = format!("(?s).*{}.*", regex_escape(&value.to_lowercase()));
            Ok(Box::new(
                RegexQuery::from_pattern(&pattern, lower_field).map_err(report)?,
            ))
        }
        QueryCriterion::Term { value } => term_query(index, value),
    }
}

/// Matches one search term against every indexed attribute with native
/// term-dictionary lookups: the term runs through the index tokenizer, and
/// every token must occur in at least one attribute. String attributes
/// contribute a [`TermQuery`] per token over their token field, text
/// attributes over their text field, combined with `Should` so one matching
/// attribute satisfies the token; integer attributes contribute an exact
/// [`TermQuery`] for tokens that parse as integers. An empty term matches
/// every record, while a term without word tokens matches none.
fn term_query(index: &EntityIndex, value: &JoiString) -> JoiResult<Box<dyn Query>> {
    let tokens = tokenize(index, value.as_str());
    if tokens.is_empty() {
        if value.as_str().trim().is_empty() {
            return Ok(Box::new(AllQuery));
        }
        return Ok(Box::new(EmptyQuery));
    }
    let mut conjunction = Vec::with_capacity(tokens.len());
    for token in tokens {
        let mut disjunction = Vec::new();
        for attribute in &index.attribute_order {
            let Some(field) = index.attributes.get(attribute) else {
                continue;
            };
            match field.data_type {
                ColumnDataType::String => {
                    let Some(token_field) = field.token_field else {
                        continue;
                    };
                    disjunction.push((
                        Occur::Should,
                        Box::new(TermQuery::new(
                            Term::from_field_text(token_field, &token),
                            IndexRecordOption::Basic,
                        )) as Box<dyn Query>,
                    ));
                }
                // Prose is already tokenized in its own field.
                ColumnDataType::Text => {
                    disjunction.push((
                        Occur::Should,
                        Box::new(TermQuery::new(
                            Term::from_field_text(field.field, &token),
                            IndexRecordOption::Basic,
                        )) as Box<dyn Query>,
                    ));
                }
                ColumnDataType::Int => {
                    if token.parse::<i64>().is_ok() {
                        disjunction.push((Occur::Should, exact_query(field, &token)?));
                    }
                }
            }
        }
        if disjunction.is_empty() {
            return Ok(Box::new(EmptyQuery));
        }
        conjunction.push((
            Occur::Must,
            Box::new(BooleanQuery::new(disjunction)) as Box<dyn Query>,
        ));
    }
    Ok(Box::new(BooleanQuery::new(conjunction)))
}

/// Requires every token in the same field.
fn token_conjunction(field: Field, tokens: &[String]) -> Box<dyn Query> {
    Box::new(BooleanQuery::new(
        tokens
            .iter()
            .map(|token| {
                (
                    Occur::Must,
                    Box::new(TermQuery::new(
                        Term::from_field_text(field, token),
                        IndexRecordOption::Basic,
                    )) as Box<dyn Query>,
                )
            })
            .collect(),
    ))
}

/// Truncated sort prefix for case-insensitive prose ordering: take the
/// first characters, then lowercase the prefix.
fn sort_key(value: &str) -> String {
    value
        .chars()
        .take(SORT_PREFIX_CHARS)
        .collect::<String>()
        .to_lowercase()
}

/// Runs a search term through the index tokenizer so query tokens follow the
/// same word splitting and lowercasing as the indexed values.
fn tokenize(index: &EntityIndex, value: &str) -> Vec<String> {
    let Some(mut analyzer) = index.index.tokenizers().get(TOKENIZER) else {
        return Vec::new();
    };
    let mut stream = analyzer.token_stream(value);
    let mut tokens = Vec::new();
    while stream.advance() {
        tokens.push(stream.token().text.clone());
    }
    tokens
}

fn composite_query(
    index: &EntityIndex,
    criteria: &[QueryCriterion],
    occur: Occur,
    empty_matches: bool,
) -> JoiResult<Box<dyn Query>> {
    if criteria.is_empty() {
        return if empty_matches {
            Ok(Box::new(AllQuery))
        } else {
            Ok(Box::new(EmptyQuery))
        };
    }
    Ok(Box::new(BooleanQuery::new(
        criteria
            .iter()
            .map(|criterion| Ok((occur, criterion_query(index, criterion)?)))
            .collect::<JoiResult<Vec<_>>>()?,
    )))
}

fn exact_query(field: &IndexedAttribute, value: &str) -> JoiResult<Box<dyn Query>> {
    let term = match field.data_type {
        ColumnDataType::String => Term::from_field_text(field.field, value),
        // Rejected in `criterion_query` before exact matching.
        ColumnDataType::Text => joi_bail!("equality is word-based for text attributes"),
        ColumnDataType::Int => Term::from_field_i64(
            field.field,
            value
                .parse()
                .map_err(|_| joi_error!("`{value}` is not a valid integer"))?,
        ),
    };
    Ok(Box::new(TermQuery::new(term, IndexRecordOption::Basic)))
}

fn range_query(
    field: &IndexedAttribute,
    minimum: Bound<&JoiString>,
    maximum: Bound<&JoiString>,
) -> JoiResult<Box<dyn Query>> {
    let convert = |bound: Bound<&JoiString>| -> JoiResult<Bound<Term>> {
        Ok(match bound {
            Bound::Included(value) => Bound::Included(match field.data_type {
                ColumnDataType::String => Term::from_field_text(field.field, value),
                // Rejected in `criterion_query` before ranging.
                ColumnDataType::Text => joi_bail!("ranges are not supported for text attributes"),
                ColumnDataType::Int => Term::from_field_i64(
                    field.field,
                    value
                        .parse()
                        .map_err(|_| joi_error!("`{value}` is not a valid integer"))?,
                ),
            }),
            Bound::Excluded(value) => Bound::Excluded(match field.data_type {
                ColumnDataType::String => Term::from_field_text(field.field, value),
                // Rejected in `criterion_query` before ranging.
                ColumnDataType::Text => joi_bail!("ranges are not supported for text attributes"),
                ColumnDataType::Int => Term::from_field_i64(
                    field.field,
                    value
                        .parse()
                        .map_err(|_| joi_error!("`{value}` is not a valid integer"))?,
                ),
            }),
            Bound::Unbounded => Bound::Unbounded,
        })
    };
    Ok(Box::new(FastFieldRangeQuery::new(
        convert(minimum)?,
        convert(maximum)?,
    )))
}

fn indexed_attribute<'a>(
    index: &'a EntityIndex,
    attribute: &AttributeName,
) -> JoiResult<&'a IndexedAttribute> {
    index
        .attributes
        .get(attribute)
        .ok_or_else(|| joi_error!("search index has no attribute `{}`", attribute.0))
}

fn field_name(index: &EntityIndex, attribute: &AttributeName) -> JoiResult<String> {
    let field = indexed_attribute(index, attribute)?.field;
    Ok(index.index.schema().get_field_name(field).to_owned())
}

fn compare_rows(
    left: &(u64, Map<String, JsonValue>),
    right: &(u64, Map<String, JsonValue>),
    sorting: &[crate::data_store::QuerySort],
) -> Ordering {
    for sort in sorting {
        let order = compare_json(
            left.1.get(sort.attribute.0.as_str()),
            right.1.get(sort.attribute.0.as_str()),
        );
        let order = match sort.direction {
            QuerySortDirection::Ascending => order,
            QuerySortDirection::Descending => order.reverse(),
        };
        if order != Ordering::Equal {
            return order;
        }
    }
    left.0.cmp(&right.0)
}

fn compare_json(left: Option<&JsonValue>, right: Option<&JsonValue>) -> Ordering {
    match (left, right) {
        (None | Some(JsonValue::Null), None | Some(JsonValue::Null)) => Ordering::Equal,
        (None | Some(JsonValue::Null), _) => Ordering::Less,
        (_, None | Some(JsonValue::Null)) => Ordering::Greater,
        (Some(JsonValue::String(left)), Some(JsonValue::String(right))) => left.cmp(right),
        (Some(JsonValue::Number(left)), Some(JsonValue::Number(right))) => left
            .as_i64()
            .unwrap_or_default()
            .cmp(&right.as_i64().unwrap_or_default()),
        (Some(left), Some(right)) => left.to_string().cmp(&right.to_string()),
    }
}

fn regex_escape(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for character in value.chars() {
        if matches!(
            character,
            '.' | '+' | '*' | '?' | '(' | ')' | '|' | '[' | ']' | '{' | '}' | '^' | '$' | '\\'
        ) {
            escaped.push('\\');
        }
        escaped.push(character);
    }
    escaped
}

fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut result = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        result.push(DIGITS[(byte >> 4) as usize] as char);
        result.push(DIGITS[(byte & 0x0f) as usize] as char);
    }
    result
}
