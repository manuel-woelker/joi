use joi_base::JoiString;
use joi_error::JoiResult;

/// Identifies a table within a data store.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct TableName(pub JoiString);

/// Identifies an attribute within a table.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct AttributeName(pub JoiString);

/// Determines which records a query selects.
pub enum QueryCriterion {
    /// Selects every available record.
    MatchAny,
    /// Inverts another criterion.
    Not(Box<QueryCriterion>),
    /// Selects records whose attribute equals at least one supplied value.
    Equals {
        /// The attribute to compare.
        attribute: AttributeName,
        /// Values accepted by the comparison.
        values: Vec<JoiString>,
    },
}

/// Describes a query against one table.
pub struct DataStoreQuery {
    /// The table to query.
    pub table_name: TableName,
    /// The condition records must satisfy.
    pub criterion: QueryCriterion,
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
    /// Integer values.
    Int(Vec<i64>),
}

/// Contains records returned by a data-store query in columnar form.
pub struct DataStoreQueryResult {
    /// The total number of records matching the query.
    pub number_of_hits: usize,
    /// The requested attribute columns.
    pub result_columns: Vec<AttributeColumn>,
}

/// Describes a table and its required column definition.
pub struct TableDescription {
    /// The table name.
    pub name: TableName,
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
pub struct ColumnDescription {
    /// The column name.
    pub name: AttributeName,
    /// A human-readable explanation of the stored value.
    pub description: JoiString,
    /// The type of values stored in the column.
    pub data_type: ColumnDataType,
}

/// The value type supported by a table column.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColumnDataType {
    /// String values.
    String,
    /// Integer values.
    Int,
}

/// Describes a sequence of changes to apply to a data store.
pub struct DataStoreMutation {
    /// The changes to apply.
    pub steps: Vec<DataStoreMutationStep>,
}

/// A single change within a data-store mutation.
pub enum DataStoreMutationStep {
    /// Inserts records into a table.
    Insert(DataStoreInsertMutation),
}

/// Describes records to insert into one table in columnar form.
pub struct DataStoreInsertMutation {
    /// The table receiving the records.
    pub table_name: TableName,
    /// The attribute columns to insert.
    pub columns: Vec<AttributeColumn>,
}

/// Reports successful completion of a data-store mutation.
pub struct DataStoreMutationResult {}

/// Executes queries and mutations against a data store.
pub trait DataStore: Send {
    /// Ensures that the requested tables and columns exist.
    fn ensure_tables(&mut self, tables: Vec<TableDescription>) -> JoiResult<()>;

    /// Executes a query and returns its matching records.
    fn query(&self, query: DataStoreQuery) -> JoiResult<DataStoreQueryResult>;

    /// Applies a mutation and returns its outcome.
    fn mutate(&mut self, mutation: DataStoreMutation) -> JoiResult<DataStoreMutationResult>;
}

/// Inserts development data into a configured data store.
pub trait TestDataProvider: Send + Sync {
    /// Inserts this provider's test records into the data store.
    fn insert_test_data(&self, data_store: &mut dyn DataStore) -> JoiResult<()>;
}

fn _assert_test_data_provider_dyn_compatible(_: &dyn TestDataProvider) {}
