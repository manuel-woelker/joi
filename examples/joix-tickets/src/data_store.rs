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
}

/// Contains records returned by a data-store query in columnar form.
pub struct DataStoreQueryResult {
    /// The total number of records matching the query.
    pub number_of_hits: usize,
    /// The requested attribute columns.
    pub result_columns: Vec<AttributeColumn>,
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
pub trait DataStore {
    /// Executes a query and returns its matching records.
    fn query(query: DataStoreQuery) -> JoiResult<DataStoreQueryResult>;

    /// Applies a mutation and returns its outcome.
    fn mutate(mutation: DataStoreMutation) -> JoiResult<DataStoreMutationResult>;
}
