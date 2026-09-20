use std::sync::{Arc, Mutex};

use joi_base::JoiString;
use joi_error::JoiResult;
use serde_json::Value as JsonValue;

/// A data store shared by commands that query or mutate application data.
pub type SharedDataStore = Arc<Mutex<Box<dyn DataStore>>>;

/// Identifies a table within a data store.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct TableName(pub JoiString);

/// Identifies an attribute within a table.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct AttributeName(pub JoiString);

/// Determines which records a query selects.
#[derive(Clone)]
pub enum QueryCriterion {
    /// Selects every available record.
    MatchAny,
    /// Selects records matching every nested criterion.
    All(Vec<QueryCriterion>),
    /// Selects records matching at least one nested criterion.
    One(Vec<QueryCriterion>),
    /// Selects records matching none of the nested criteria.
    None(Vec<QueryCriterion>),
    /// Inverts another criterion.
    Not(Box<QueryCriterion>),
    /// Selects records whose attribute equals at least one supplied value.
    Equals {
        /// The attribute to compare.
        attribute: AttributeName,
        /// Values accepted by the comparison.
        values: Vec<JoiString>,
    },
    /// Selects records whose attribute is less than the supplied value.
    LessThan {
        /// The attribute to compare.
        attribute: AttributeName,
        /// The exclusive upper bound.
        value: JoiString,
    },
    /// Selects records whose attribute has a non-null, non-empty value.
    Set(AttributeName),
    /// Selects records whose attribute is null or empty.
    Unset(AttributeName),
    /// Selects records whose attribute falls within the supplied inclusive bounds.
    InRange {
        /// The attribute to compare.
        attribute: AttributeName,
        /// Optional inclusive lower bound.
        minimum: Option<JoiString>,
        /// Optional inclusive upper bound.
        maximum: Option<JoiString>,
    },
    /// Selects records whose string representation contains a value.
    Contains {
        /// The attribute to inspect.
        attribute: AttributeName,
        /// The case-insensitive substring to find.
        value: JoiString,
    },
    /// Selects records where any attribute matches a single search term.
    ///
    /// The term runs through the index tokenizer, and every token must occur
    /// in at least one attribute: string attributes match whole word tokens
    /// case-insensitively, integer attributes match tokens that parse as
    /// their exact value. An empty term matches every record.
    Term {
        /// The search term to find across all attributes.
        value: JoiString,
    },
}

/// Direction used to order values from one query attribute.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QuerySortDirection {
    /// Orders lower values before higher values.
    Ascending,
    /// Orders higher values before lower values.
    Descending,
}

/// One attribute and direction in an ordered query sort sequence.
#[derive(Clone)]
pub struct QuerySort {
    /// The attribute used for sorting.
    pub attribute: AttributeName,
    /// The direction used for this attribute.
    pub direction: QuerySortDirection,
}

/// Describes a query against one table.
pub struct DataStoreQuery {
    /// The table to query.
    pub table_name: TableName,
    /// The condition records must satisfy.
    pub criterion: QueryCriterion,
    /// Sort criteria applied in priority order before limiting the result.
    pub sorting: Vec<QuerySort>,
    /// The maximum number of records to return.
    pub max_results: usize,
    /// The attributes to include in the result.
    pub attributes: Vec<AttributeName>,
}

/// Contains the values returned for one attribute.
pub struct AttributeColumn {
    /// The attribute represented by this column.
    pub attribute: AttributeName,
    /// The values in this column.
    pub values: Values,
}

/// A homogeneous sequence of attribute values.
pub enum Values {
    /// String values.
    String(Vec<JoiString>),
    /// Nullable string values used when mutating optional columns.
    NullableString(Vec<Option<JoiString>>),
    /// Integer values.
    Int(Vec<i64>),
}

impl Values {
    /// The number of values in this column.
    pub fn len(&self) -> usize {
        match self {
            Values::String(values) => values.len(),
            Values::NullableString(values) => values.len(),
            Values::Int(values) => values.len(),
        }
    }

    /// Whether this column contains no values.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// The column type these values belong to.
    pub fn data_type(&self) -> ColumnDataType {
        match self {
            Values::String(_) | Values::NullableString(_) => ColumnDataType::String,
            Values::Int(_) => ColumnDataType::Int,
        }
    }

    /// The JSON representation of the value at `index`.
    ///
    /// Entity bytes are stored as JSON objects, so this is the single place
    /// where columnar values meet that encoding.
    pub fn value_at(&self, index: usize) -> JsonValue {
        match self {
            Values::String(values) => JsonValue::String(values[index].to_string()),
            Values::NullableString(values) => {
                values[index].as_ref().map_or(JsonValue::Null, |value| {
                    JsonValue::String(value.to_string())
                })
            }
            Values::Int(values) => JsonValue::Number(values[index].into()),
        }
    }
}

/// Contains records returned by a data-store query in columnar form.
pub struct DataStoreQueryResult {
    /// The total number of records matching the query.
    pub number_of_hits: usize,
    /// The requested attribute columns.
    pub result_columns: Vec<AttributeColumn>,
}

/// One value and its number of occurrences in an aggregate result.
pub struct DataStoreCountValue {
    /// Grouped value, or `None` for a total count or null attribute value.
    pub value: Option<DataStoreValue>,
    /// Number of matching records.
    pub count: usize,
}

/// Scalar values returned by datastore aggregations.
pub enum DataStoreValue {
    /// String value.
    String(JoiString),
    /// Signed integer value.
    Int(i64),
}

/// Describes a table and its required column definition.
#[derive(Clone)]
pub struct TableDescription {
    /// The table name.
    pub name: TableName,
    /// Whether this table is part of the discoverable application model.
    pub discoverable: bool,
    /// The columns defined for the table, the first one is used as primary key
    pub columns: Vec<ColumnDescription>,
}

/// Provides a table definition contributed through the plugin registry.
pub trait TableDescriptionProvider: Send + Sync {
    /// Returns the table definition contributed by this provider.
    fn table_description(&self) -> TableDescription;
}

fn _assert_table_description_provider_dyn_compatible(_: &dyn TableDescriptionProvider) {}

/// Describes a named column in a table.
#[derive(Clone)]
pub struct ColumnDescription {
    /// The column name.
    pub name: AttributeName,
    /// A human-readable explanation of the stored value.
    pub description: JoiString,
    /// The type of values stored in the column.
    pub data_type: ColumnDataType,
    /// Whether the column accepts null values.
    pub optional: bool,
}

/// The value type supported by a table column.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ColumnDataType {
    /// String values with exact matching, sorting, and faceting.
    String,
    /// Prose values stored as strings but indexed as tokenized text only.
    /// Equality is word-based, sorting orders by a truncated lowercase
    /// prefix, and ranges and aggregations are not supported.
    Text,
    /// Foreign identifiers stored as strings and indexed exactly like
    /// [`ColumnDataType::String`]. References always address the target
    /// entity type's primary key. Only exact matching is meaningful:
    /// substring search is rejected since callers must supply the id.
    Reference {
        /// The referenced entity type.
        entity: TableName,
    },
    /// Integer values.
    Int,
}

impl ColumnDataType {
    /// Whether column values of this physical representation fit the type.
    /// Text and references are physically represented as strings.
    pub fn accepts(&self, values: &Values) -> bool {
        let strings = matches!(values, Values::String(_) | Values::NullableString(_));
        match self {
            ColumnDataType::String | ColumnDataType::Text | ColumnDataType::Reference { .. } => {
                strings
            }
            ColumnDataType::Int => matches!(values, Values::Int(_)),
        }
    }
}

/// Describes a sequence of changes to apply to a data store.
pub struct DataStoreMutation {
    /// The changes to apply.
    pub steps: Vec<DataStoreMutationStep>,
    /// Whether to return complete created and updated entities.
    pub return_entities: bool,
}

/// A single change within a data-store mutation.
pub enum DataStoreMutationStep {
    /// Inserts records into a table.
    Insert(DataStoreInsertMutation),
    /// Updates records in a table by primary-key ID.
    Update(DataStoreUpdateMutation),
    /// Deletes records by primary-key ID.
    Delete(DataStoreDeleteMutation),
}

impl DataStoreMutationStep {
    /// The table this step reads or writes.
    pub fn table(&self) -> &TableName {
        match self {
            DataStoreMutationStep::Insert(insert) => &insert.table_name,
            DataStoreMutationStep::Update(update) => &update.table_name,
            DataStoreMutationStep::Delete(delete) => &delete.table_name,
        }
    }

    /// The number of rows this step addresses.
    ///
    /// Insert steps address one row per column value; update and delete
    /// steps address one row per ID.
    pub fn len(&self) -> usize {
        match self {
            DataStoreMutationStep::Insert(insert) => insert
                .columns
                .first()
                .map_or(0, |column| column.values.len()),
            DataStoreMutationStep::Update(update) => update.ids.len(),
            DataStoreMutationStep::Delete(delete) => delete.ids.len(),
        }
    }

    /// Whether this step addresses no rows.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// Describes records to delete from one table by primary-key ID.
pub struct DataStoreDeleteMutation {
    /// The table containing the records.
    pub table_name: TableName,
    /// Primary-key IDs identifying records to delete.
    pub ids: Vec<JoiString>,
}

/// Describes records to insert into one table in columnar form.
pub struct DataStoreInsertMutation {
    /// The table receiving the records.
    pub table_name: TableName,
    /// The attribute columns to insert.
    pub columns: Vec<AttributeColumn>,
}

/// Describes records to update in one table in columnar form.
pub struct DataStoreUpdateMutation {
    /// The table containing the records.
    pub table_name: TableName,
    /// Primary-key IDs identifying records to update.
    pub ids: Vec<JoiString>,
    /// Attribute columns containing one new value per ID.
    pub columns: Vec<AttributeColumn>,
}

/// Reports successful completion of a data-store mutation.
pub struct DataStoreMutationResult {
    /// Complete created or updated entities when requested by the caller.
    pub entities: Option<Vec<crate::Entity>>,
}

/// Executes queries and mutations against a data store.
pub trait DataStore: Send {
    /// Ensures that the requested tables and columns exist.
    fn ensure_tables(&mut self, tables: Vec<TableDescription>) -> JoiResult<()>;

    /// Executes a query and returns its matching records and total count.
    fn query(&self, query: DataStoreQuery) -> JoiResult<DataStoreQueryResult> {
        self.query_rows(query, true)
    }

    /// Executes a row query, optionally calculating the total count before limiting rows.
    fn query_rows(
        &self,
        query: DataStoreQuery,
        count_all_rows: bool,
    ) -> JoiResult<DataStoreQueryResult>;

    /// Counts matching records, optionally grouped by one attribute.
    fn count(
        &self,
        table_name: &TableName,
        criterion: &QueryCriterion,
        attribute: Option<&AttributeName>,
        max_results: usize,
    ) -> JoiResult<Vec<DataStoreCountValue>>;

    /// Applies a mutation and returns its outcome.
    fn mutate(&mut self, mutation: DataStoreMutation) -> JoiResult<DataStoreMutationResult>;
}

/// Inserts development data into a configured data store.
pub trait TestDataProvider: Send + Sync {
    /// Inserts this provider's test records into the data store.
    fn insert_test_data(&self, data_store: &mut dyn DataStore) -> JoiResult<()>;
}

fn _assert_test_data_provider_dyn_compatible(_: &dyn TestDataProvider) {}
