use joi_base::JoiString;
use joi_error::{JoiResult, joi_error};
use serde::{Deserialize, Serialize};

use crate::command::Command;
use crate::command_handler::CommandHandler;
use crate::data_store::{
    AttributeName, DataStoreQuery, DataStoreValue, QueryCriterion, QuerySort, QuerySortDirection,
    SharedDataStore, TableName, Values,
};

/// Executes generic table queries against a shared data store.
pub struct QueryCommand {
    data_store: SharedDataStore,
}

impl QueryCommand {
    /// Creates a query command using the shared data store.
    pub fn new(data_store: SharedDataStore) -> Self {
        Self { data_store }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
/// JSON-facing description of a generic table query.
pub struct QueryRequest {
    table_name: JoiString,
    criterion: QueryRequestCriterion,
    results: Vec<QueryRequestResult>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
enum QueryRequestResult {
    Rows {
        max_results: usize,
        sorting: Vec<QueryRequestSort>,
        attributes: Vec<JoiString>,
    },
    Aggregate {
        aggregation: QueryAggregation,
        attribute: Option<JoiString>,
        max_results: usize,
        criterion: Option<QueryRequestCriterion>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum QueryAggregation {
    Count,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct QueryRequestSort {
    attribute: JoiString,
    direction: QueryRequestSortDirection,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum QueryRequestSortDirection {
    Ascending,
    Descending,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum QueryRequestCriterion {
    MatchAny,
    All(Vec<QueryRequestCriterion>),
    One(Vec<QueryRequestCriterion>),
    None(Vec<QueryRequestCriterion>),
    Not(Box<QueryRequestCriterion>),
    Equals {
        attribute: JoiString,
        values: Vec<JoiString>,
    },
    LessThan {
        attribute: JoiString,
        value: JoiString,
    },
    Set {
        attribute: JoiString,
    },
    Unset {
        attribute: JoiString,
    },
    InRange {
        attribute: JoiString,
        minimum: Option<JoiString>,
        maximum: Option<JoiString>,
    },
    Contains {
        attribute: JoiString,
        value: JoiString,
    },
    Term {
        value: JoiString,
    },
}

impl Command for QueryRequest {
    const NAME: &'static str = "query";
    const DESCRIPTION: &'static str = "Query records from a registered data table.";
    type Response = QueryResponse;
}

#[derive(Debug, PartialEq, Serialize)]
/// Columnar result returned by the `query` command.
pub struct QueryResponse {
    results: Vec<QueryResponseResult>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum QueryResponseResult {
    Rows {
        result_columns: Vec<QueryResultColumn>,
    },
    Aggregate {
        aggregation: QueryAggregation,
        attribute: Option<JoiString>,
        values: Vec<QueryAggregateValue>,
    },
}

#[derive(Debug, PartialEq, Serialize)]
struct QueryAggregateValue {
    value: Option<serde_json::Value>,
    count: usize,
}

#[derive(Debug, PartialEq, Serialize)]
/// Values returned for one requested attribute.
pub struct QueryResultColumn {
    attribute: JoiString,
    values: QueryValues,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "type", content = "values", rename_all = "snake_case")]
/// A homogeneous sequence of query result values.
pub enum QueryValues {
    /// String values.
    String(Vec<JoiString>),
    /// Signed integer values.
    Int(Vec<i64>),
}

impl CommandHandler for QueryCommand {
    type Command = QueryRequest;

    fn execute(
        &self,
        _context: &crate::command_handler::CommandContext,
        request: Self::Command,
    ) -> JoiResult<QueryResponse> {
        let table_name = TableName(request.table_name);
        let criterion = query_criterion(request.criterion);
        let store = self
            .data_store
            .lock()
            .map_err(|_| joi_error!("data store lock is poisoned"))?;
        let results = request
            .results
            .into_iter()
            .map(|shape| match shape {
                QueryRequestResult::Rows {
                    max_results,
                    sorting,
                    attributes,
                } => {
                    let result = store.query_rows(
                        DataStoreQuery {
                            table_name: table_name.clone(),
                            criterion: criterion.clone(),
                            sorting: sorting
                                .into_iter()
                                .map(|sort| QuerySort {
                                    attribute: AttributeName(sort.attribute),
                                    direction: match sort.direction {
                                        QueryRequestSortDirection::Ascending => {
                                            QuerySortDirection::Ascending
                                        }
                                        QueryRequestSortDirection::Descending => {
                                            QuerySortDirection::Descending
                                        }
                                    },
                                })
                                .collect(),
                            max_results,
                            attributes: attributes.into_iter().map(AttributeName).collect(),
                        },
                        false,
                    )?;
                    Ok(QueryResponseResult::Rows {
                        result_columns: result
                            .result_columns
                            .into_iter()
                            .map(|column| QueryResultColumn {
                                attribute: column.attribute.0,
                                values: match column.values {
                                    Values::String(values) => QueryValues::String(values),
                                    Values::NullableString(_) => {
                                        unreachable!("queries never return mutation-only values")
                                    }
                                    Values::Int(values) => QueryValues::Int(values),
                                },
                            })
                            .collect(),
                    })
                }
                QueryRequestResult::Aggregate {
                    aggregation,
                    attribute,
                    max_results,
                    criterion: aggregate_criterion,
                } => {
                    let aggregate_criterion = aggregate_criterion
                        .map(query_criterion)
                        .unwrap_or_else(|| criterion.clone());
                    let values = store
                        .count(
                            &table_name,
                            &aggregate_criterion,
                            attribute
                                .as_ref()
                                .map(|value| AttributeName(value.clone()))
                                .as_ref(),
                            max_results,
                        )?
                        .into_iter()
                        .map(|entry| QueryAggregateValue {
                            value: entry.value.map(|value| match value {
                                DataStoreValue::String(value) => {
                                    serde_json::Value::String(value.to_string())
                                }
                                DataStoreValue::Int(value) => {
                                    serde_json::Value::Number(value.into())
                                }
                            }),
                            count: entry.count,
                        })
                        .collect();
                    Ok(QueryResponseResult::Aggregate {
                        aggregation,
                        attribute,
                        values,
                    })
                }
            })
            .collect::<JoiResult<Vec<_>>>()?;

        Ok(QueryResponse { results })
    }
}

fn query_criterion(criterion: QueryRequestCriterion) -> QueryCriterion {
    match criterion {
        QueryRequestCriterion::MatchAny => QueryCriterion::MatchAny,
        QueryRequestCriterion::All(criteria) => {
            QueryCriterion::All(criteria.into_iter().map(query_criterion).collect())
        }
        QueryRequestCriterion::One(criteria) => {
            QueryCriterion::One(criteria.into_iter().map(query_criterion).collect())
        }
        QueryRequestCriterion::None(criteria) => {
            QueryCriterion::None(criteria.into_iter().map(query_criterion).collect())
        }
        QueryRequestCriterion::Not(criterion) => {
            QueryCriterion::Not(Box::new(query_criterion(*criterion)))
        }
        QueryRequestCriterion::Equals { attribute, values } => QueryCriterion::Equals {
            attribute: AttributeName(attribute),
            values,
        },
        QueryRequestCriterion::LessThan { attribute, value } => QueryCriterion::LessThan {
            attribute: AttributeName(attribute),
            value,
        },
        QueryRequestCriterion::Set { attribute } => QueryCriterion::Set(AttributeName(attribute)),
        QueryRequestCriterion::Unset { attribute } => {
            QueryCriterion::Unset(AttributeName(attribute))
        }
        QueryRequestCriterion::InRange {
            attribute,
            minimum,
            maximum,
        } => QueryCriterion::InRange {
            attribute: AttributeName(attribute),
            minimum,
            maximum,
        },
        QueryRequestCriterion::Contains { attribute, value } => QueryCriterion::Contains {
            attribute: AttributeName(attribute),
            value,
        },
        QueryRequestCriterion::Term { value } => QueryCriterion::Term { value },
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use joi_base::JoiString;

    use crate::command_handler::CommandHandler;
    use crate::data_store::{
        AttributeColumn, AttributeName, ColumnDataType, ColumnDescription, DataStore,
        DataStoreInsertMutation, DataStoreMutation, DataStoreMutationStep, TableDescription,
        TableDescriptionProvider, TableName, TestDataProvider, Values,
    };
    use crate::storage::IndexedDataStore;
    use crate::user_session_command::{UserTableDescriptionProvider, UserTestDataProvider};

    use super::{
        QueryAggregation, QueryCommand, QueryRequest, QueryRequestCriterion, QueryRequestResult,
        QueryRequestSort, QueryRequestSortDirection, QueryResponseResult, QueryValues,
    };

    #[test]
    fn queries_columns() {
        let mut store = IndexedDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![UserTableDescriptionProvider.table_description()])
            .unwrap();
        UserTestDataProvider.insert_test_data(&mut store).unwrap();
        let command = QueryCommand::new(Arc::new(Mutex::new(Box::new(store))));

        let response = command
            .execute(
                &Default::default(),
                QueryRequest {
                    table_name: "users".into(),
                    criterion: QueryRequestCriterion::MatchAny,
                    results: vec![
                        QueryRequestResult::Rows {
                            sorting: vec![QueryRequestSort {
                                attribute: "username".into(),
                                direction: QueryRequestSortDirection::Descending,
                            }],
                            max_results: 2,
                            attributes: vec!["username".into(), "name".into()],
                        },
                        QueryRequestResult::Aggregate {
                            aggregation: QueryAggregation::Count,
                            attribute: None,
                            max_results: 1,
                            criterion: None,
                        },
                        QueryRequestResult::Aggregate {
                            aggregation: QueryAggregation::Count,
                            attribute: Some("username".into()),
                            max_results: 10,
                            criterion: Some(QueryRequestCriterion::Contains {
                                attribute: "name".into(),
                                value: "developer".into(),
                            }),
                        },
                    ],
                },
            )
            .unwrap();

        let QueryResponseResult::Rows { result_columns } = &response.results[0] else {
            panic!("expected rows")
        };
        assert_eq!(result_columns.len(), 2);
        assert!(matches!(
            &result_columns[0].values,
            QueryValues::String(values) if values == &[
                JoiString::from("uma.user"),
                JoiString::from("ollie.owner"),
            ]
        ));
        assert!(matches!(
            &response.results[1],
            QueryResponseResult::Aggregate { values, .. } if values.len() == 1 && values[0].count == 5
        ));
        assert!(matches!(
            &response.results[2],
            QueryResponseResult::Aggregate { values, .. } if values.len() == 1 && values[0].count == 1
        ));

        let ascending = command
            .execute(
                &Default::default(),
                QueryRequest {
                    table_name: "users".into(),
                    criterion: QueryRequestCriterion::MatchAny,
                    results: vec![QueryRequestResult::Rows {
                        sorting: vec![QueryRequestSort {
                            attribute: "username".into(),
                            direction: QueryRequestSortDirection::Ascending,
                        }],
                        max_results: 2,
                        attributes: vec!["username".into()],
                    }],
                },
            )
            .unwrap();
        let QueryResponseResult::Rows { result_columns } = &ascending.results[0] else {
            panic!("expected rows")
        };
        assert!(matches!(
            &result_columns[0].values,
            QueryValues::String(values) if values == &[
                JoiString::from("jane.developer"),
                JoiString::from("joe.tester"),
            ]
        ));
    }

    #[test]
    fn matches_search_term_across_attributes() {
        let mut store = IndexedDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![UserTableDescriptionProvider.table_description()])
            .unwrap();
        UserTestDataProvider.insert_test_data(&mut store).unwrap();
        let command = QueryCommand::new(Arc::new(Mutex::new(Box::new(store))));

        let search = |value: &str| {
            command
                .execute(
                    &Default::default(),
                    QueryRequest {
                        table_name: "users".into(),
                        criterion: QueryRequestCriterion::Term {
                            value: value.into(),
                        },
                        results: vec![QueryRequestResult::Rows {
                            sorting: Vec::new(),
                            max_results: 10,
                            attributes: vec!["username".into()],
                        }],
                    },
                )
                .unwrap()
        };
        let usernames = |response: &super::QueryResponse| {
            let QueryResponseResult::Rows { result_columns } = &response.results[0] else {
                panic!("expected rows")
            };
            let QueryValues::String(values) = &result_columns[0].values else {
                panic!("expected string values")
            };
            values.clone()
        };

        // Matches the display name as well as the login name.
        assert_eq!(
            usernames(&search("developer")),
            vec![JoiString::from("jane.developer")]
        );
        // Matching is case-insensitive.
        assert_eq!(
            usernames(&search("JOE.TESTER")),
            vec![JoiString::from("joe.tester")]
        );
        // Multi-word terms match across word boundaries.
        assert_eq!(
            usernames(&search("jane developer")),
            vec![JoiString::from("jane.developer")]
        );
        assert!(usernames(&search("no-such-user")).is_empty());
    }

    #[test]
    fn queries_text_attributes_through_tokens() {
        struct NoteTable;
        impl TableDescriptionProvider for NoteTable {
            fn table_description(&self) -> TableDescription {
                let column = |name: &'static str, data_type: ColumnDataType| ColumnDescription {
                    name: AttributeName(name.into()),
                    description: name.into(),
                    data_type,
                    optional: false,
                    references: None,
                };
                TableDescription {
                    name: TableName("notes".into()),
                    discoverable: false,
                    columns: vec![
                        column("id", ColumnDataType::String),
                        column("title", ColumnDataType::Text),
                    ],
                }
            }
        }
        let mut store = IndexedDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![NoteTable.table_description()])
            .unwrap();
        store
            .mutate(DataStoreMutation {
                return_entities: false,
                steps: vec![DataStoreMutationStep::Insert(DataStoreInsertMutation {
                    table_name: TableName("notes".into()),
                    columns: vec![
                        AttributeColumn {
                            attribute: AttributeName("id".into()),
                            values: Values::String(vec!["a".into(), "b".into(), "c".into()]),
                        },
                        AttributeColumn {
                            attribute: AttributeName("title".into()),
                            values: Values::String(vec![
                                JoiString::from("Fix navigation bug"),
                                JoiString::from("Navigation redesign"),
                                JoiString::from("apple turnover"),
                            ]),
                        },
                    ],
                })],
            })
            .unwrap();
        let command = QueryCommand::new(Arc::new(Mutex::new(Box::new(store))));

        let titles = |criterion: QueryRequestCriterion| {
            let response = command
                .execute(
                    &Default::default(),
                    QueryRequest {
                        table_name: "notes".into(),
                        criterion,
                        results: vec![QueryRequestResult::Rows {
                            sorting: Vec::new(),
                            max_results: 10,
                            attributes: vec!["title".into()],
                        }],
                    },
                )
                .unwrap();
            let QueryResponseResult::Rows { result_columns } = &response.results[0] else {
                panic!("expected rows")
            };
            let QueryValues::String(values) = &result_columns[0].values else {
                panic!("expected string values")
            };
            let mut values = values.clone();
            values.sort();
            values
        };

        // Single tokens match whole words; phrases match word sequences.
        assert_eq!(
            titles(QueryRequestCriterion::Contains {
                attribute: "title".into(),
                value: "navigation".into(),
            }),
            vec![
                JoiString::from("Fix navigation bug"),
                JoiString::from("Navigation redesign"),
            ]
        );
        assert_eq!(
            titles(QueryRequestCriterion::Contains {
                attribute: "title".into(),
                value: "fix navigation".into(),
            }),
            vec![JoiString::from("Fix navigation bug")]
        );
        // Equality on prose is word-based rather than exact.
        assert_eq!(
            titles(QueryRequestCriterion::Equals {
                attribute: "title".into(),
                values: vec!["navigation fix".into()],
            }),
            vec![JoiString::from("Fix navigation bug")]
        );
        // Quicksearch reaches text columns through the same tokens.
        assert_eq!(
            titles(QueryRequestCriterion::Term {
                value: "redesign".into(),
            }),
            vec![JoiString::from("Navigation redesign")]
        );

        // Prose sorts case-insensitively by its truncated sort key.
        let response = command
            .execute(
                &Default::default(),
                QueryRequest {
                    table_name: "notes".into(),
                    criterion: QueryRequestCriterion::MatchAny,
                    results: vec![QueryRequestResult::Rows {
                        sorting: vec![QueryRequestSort {
                            attribute: "title".into(),
                            direction: QueryRequestSortDirection::Ascending,
                        }],
                        max_results: 10,
                        attributes: vec!["title".into()],
                    }],
                },
            )
            .unwrap();
        let QueryResponseResult::Rows { result_columns } = &response.results[0] else {
            panic!("expected rows")
        };
        let QueryValues::String(values) = &result_columns[0].values else {
            panic!("expected string values")
        };
        assert_eq!(
            values,
            &[
                JoiString::from("apple turnover"),
                JoiString::from("Fix navigation bug"),
                JoiString::from("Navigation redesign"),
            ]
        );

        // Ranges and aggregations need exact terms or fast fields.
        assert!(
            command
                .execute(
                    &Default::default(),
                    QueryRequest {
                        table_name: "notes".into(),
                        criterion: QueryRequestCriterion::MatchAny,
                        results: vec![QueryRequestResult::Aggregate {
                            aggregation: QueryAggregation::Count,
                            attribute: Some("title".into()),
                            max_results: 10,
                            criterion: None,
                        }],
                    },
                )
                .is_err()
        );
        assert!(
            command
                .execute(
                    &Default::default(),
                    QueryRequest {
                        table_name: "notes".into(),
                        criterion: QueryRequestCriterion::LessThan {
                            attribute: "title".into(),
                            value: "m".into(),
                        },
                        results: vec![QueryRequestResult::Aggregate {
                            aggregation: QueryAggregation::Count,
                            attribute: None,
                            max_results: 1,
                            criterion: None,
                        }],
                    },
                )
                .is_err()
        );
    }

    #[test]
    fn executes_composed_criteria() {
        let mut store = IndexedDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![UserTableDescriptionProvider.table_description()])
            .unwrap();
        UserTestDataProvider.insert_test_data(&mut store).unwrap();
        let command = QueryCommand::new(Arc::new(Mutex::new(Box::new(store))));

        let response = command
            .execute(
                &Default::default(),
                QueryRequest {
                    table_name: "users".into(),
                    criterion: QueryRequestCriterion::All(vec![
                        QueryRequestCriterion::One(vec![
                            QueryRequestCriterion::Contains {
                                attribute: "name".into(),
                                value: "developer".into(),
                            },
                            QueryRequestCriterion::Equals {
                                attribute: "username".into(),
                                values: vec!["missing".into()],
                            },
                        ]),
                        QueryRequestCriterion::None(vec![QueryRequestCriterion::Equals {
                            attribute: "username".into(),
                            values: vec!["joe.tester".into()],
                        }]),
                        QueryRequestCriterion::Set {
                            attribute: "name".into(),
                        },
                    ]),
                    results: vec![QueryRequestResult::Rows {
                        sorting: Vec::new(),
                        max_results: 10,
                        attributes: vec!["username".into()],
                    }],
                },
            )
            .unwrap();

        let QueryResponseResult::Rows { result_columns } = &response.results[0] else {
            panic!("expected rows")
        };
        assert!(matches!(
            &result_columns[0].values,
            QueryValues::String(values) if values == &[JoiString::from("jane.developer")]
        ));
    }
}
