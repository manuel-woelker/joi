use std::sync::{Arc, Mutex};

use joi_base::JoiString;
use joi_error::{JoiResult, joi_error};
use serde::{Deserialize, Serialize};

use crate::action::{Action, ActionDescriptor, ActionRequest};
use crate::data_store::{AttributeName, DataStore, DataStoreQuery, QueryCriterion, Values};

pub type SharedDataStore = Arc<Mutex<Box<dyn DataStore>>>;

pub struct TicketQueryAction {
    data_store: SharedDataStore,
}

impl TicketQueryAction {
    pub fn new(data_store: SharedDataStore) -> Self {
        Self { data_store }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TicketQueryRequest {
    criterion: TicketQueryCriterion,
    max_results: usize,
    attributes: Vec<JoiString>,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum TicketQueryCriterion {
    MatchAny,
}

impl ActionRequest for TicketQueryRequest {
    type Response = TicketQueryResponse;
}

#[derive(Debug, PartialEq, Serialize)]
pub struct TicketQueryResponse {
    number_of_hits: usize,
    result_columns: Vec<TicketQueryResultColumn>,
}

#[derive(Debug, PartialEq, Serialize)]
pub struct TicketQueryResultColumn {
    attribute: JoiString,
    values: TicketQueryValues,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "type", content = "values", rename_all = "snake_case")]
pub enum TicketQueryValues {
    String(Vec<JoiString>),
    Int(Vec<i64>),
}

impl Action for TicketQueryAction {
    type Request = TicketQueryRequest;

    fn descriptor() -> ActionDescriptor {
        ActionDescriptor {
            name: "tickets/query".into(),
            description: "Queries tickets from the data store".into(),
        }
    }

    fn execute(&self, request: Self::Request) -> JoiResult<TicketQueryResponse> {
        let query = DataStoreQuery {
            table_name: crate::data_store::TableName("tickets".into()),
            criterion: match request.criterion {
                TicketQueryCriterion::MatchAny => QueryCriterion::MatchAny,
            },
            max_results: request.max_results,
            attributes: request.attributes.into_iter().map(AttributeName).collect(),
        };
        let result = self
            .data_store
            .lock()
            .map_err(|_| joi_error!("ticket data store lock is poisoned"))?
            .query(query)?;

        Ok(TicketQueryResponse {
            number_of_hits: result.number_of_hits,
            result_columns: result
                .result_columns
                .into_iter()
                .map(|column| TicketQueryResultColumn {
                    attribute: column.attribute.0,
                    values: match column.values {
                        Values::String(values) => TicketQueryValues::String(values),
                        Values::Int(values) => TicketQueryValues::Int(values),
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

    use super::{TicketQueryAction, TicketQueryCriterion, TicketQueryRequest, TicketQueryValues};

    #[test]
    fn queries_ticket_columns() {
        let mut store = SqliteDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![TicketTableDescriptionProvider.table_description()])
            .unwrap();
        TicketTestDataProvider.insert_test_data(&mut store).unwrap();
        let action = TicketQueryAction::new(Arc::new(Mutex::new(Box::new(store))));

        let response = action
            .execute(TicketQueryRequest {
                criterion: TicketQueryCriterion::MatchAny,
                max_results: 2,
                attributes: vec!["id".into(), "status".into()],
            })
            .unwrap();

        assert_eq!(response.number_of_hits, 3);
        assert_eq!(response.result_columns.len(), 2);
        assert!(matches!(
            &response.result_columns[0].values,
            TicketQueryValues::String(values) if values.len() == 2 && values[0] == "TICKET-1"
        ));
    }
}
