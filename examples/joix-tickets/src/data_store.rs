use joi_base::JoiString;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct TableName(pub JoiString);

pub enum QueryCriterion {
    MatchAny,
}

pub struct DataStoreQuery {
    pub table_name: TableName,
    pub criterion: QueryCriterion,
    pub max_results: usize,
    pub attributes: Vec<JoiString>,
}

pub struct ResultColumn {
    pub attribute: JoiString,
    pub values: Values,
}

pub enum Values {
    String(Vec<JoiString>),
}

pub struct DataStoreQueryResult {
    pub number_of_hits: usize,
    pub result_columns: ResultColumn,
}

pub trait DataStore {
    fn query(query: DataStoreQuery) -> DataStoreQueryResult;
}
