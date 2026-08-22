pub enum QueryCriterion {
    MatchAny,
}

pub struct DataStoreQuery {
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
use joi_base::JoiString;
