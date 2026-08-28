use std::sync::{Arc, Mutex};

use joi_base::JoiString;
use joi_error::{JoiResult, joi_error};
use serde::{Deserialize, Serialize};

use crate::action::{Action, ActionDescriptor, ActionRequest};
use crate::data_store::{
    AttributeName, DataStore, DataStoreQuery, QueryCriterion, TableName, Values,
};

pub type SharedDataStore = Arc<Mutex<Box<dyn DataStore>>>;

pub struct QueryAction {
    data_store: SharedDataStore,
}

impl QueryAction {
    pub fn new(data_store: SharedDataStore) -> Self {
        Self { data_store }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QueryRequest {
    table_name: JoiString,
    criterion: QueryRequestCriterion,
    max_results: usize,
    attributes: Vec<JoiString>,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum QueryRequestCriterion {
    MatchAny,
}

impl ActionRequest for QueryRequest {
    type Response = QueryResponse;
}

#[derive(Debug, PartialEq, Serialize)]
pub struct QueryResponse {
    number_of_hits: usize,
    result_columns: Vec<QueryResultColumn>,
}

#[derive(Debug, PartialEq, Serialize)]
pub struct QueryResultColumn {
    attribute: JoiString,
    values: QueryValues,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "type", content = "values", rename_all = "snake_case")]
pub enum QueryValues {
    String(Vec<JoiString>),
    Int(Vec<i64>),
}

impl Action for QueryAction {
    type Request = QueryRequest;

    fn descriptor() -> ActionDescriptor {
        ActionDescriptor {
            name: "query".into(),
            description: "Queries a table from the data store".into(),
        }
    }

    fn execute(&self, request: Self::Request) -> JoiResult<QueryResponse> {
        let query = DataStoreQuery {
            table_name: TableName(request.table_name),
            criterion: match request.criterion {
                QueryRequestCriterion::MatchAny => QueryCriterion::MatchAny,
            },
            max_results: request.max_results,
            attributes: request.attributes.into_iter().map(AttributeName).collect(),
        };
        let result = self
            .data_store
            .lock()
            .map_err(|_| joi_error!("ticket data store lock is poisoned"))?
            .query(query)?;

        Ok(QueryResponse {
            number_of_hits: result.number_of_hits,
            result_columns: result
                .result_columns
                .into_iter()
                .map(|column| QueryResultColumn {
                    attribute: column.attribute.0,
                    values: match column.values {
                        Values::String(values) => QueryValues::String(values),
                        Values::Int(values) => QueryValues::Int(values),
                    },
                })
                .collect(),
        })
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use crate::action::Action;
    use crate::data_store::{DataStore, TableDescriptionProvider, TestDataProvider};
    use crate::sqlite_data_store::SqliteDataStore;
    use crate::tickets_module::{TicketTableDescriptionProvider, TicketTestDataProvider};

    use super::{QueryAction, QueryRequest, QueryRequestCriterion, QueryValues};

    #[test]
    fn queries_ticket_columns() {
        let mut store = SqliteDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![TicketTableDescriptionProvider.table_description()])
            .unwrap();
        TicketTestDataProvider.insert_test_data(&mut store).unwrap();
        let action = QueryAction::new(Arc::new(Mutex::new(Box::new(store))));

        let response = action
            .execute(QueryRequest {
                table_name: "tickets".into(),
                criterion: QueryRequestCriterion::MatchAny,
                max_results: 2,
                attributes: vec!["key".into(), "status".into()],
            })
            .unwrap();

        assert_eq!(response.number_of_hits, 3);
        assert_eq!(response.result_columns.len(), 2);
        assert!(matches!(
            &response.result_columns[0].values,
            QueryValues::String(values) if values.len() == 2 && values[0] == "TEST-1"
        ));
    }
}
