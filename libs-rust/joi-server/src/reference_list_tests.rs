use crate::{data_store::*, mutation_contributor::MutationContext, storage::IndexedDataStore};

fn schema() -> TableDescription {
    TableDescription {
        name: TableName("items".into()),
        discoverable: true,
        presentation: None,
        columns: vec![
            ColumnDescription {
                name: AttributeName("id".into()),
                description: "ID".into(),
                data_type: ColumnDataType::String,
                optional: false,
            },
            ColumnDescription {
                name: AttributeName("members".into()),
                description: "Members".into(),
                data_type: ColumnDataType::ReferenceList {
                    entity: TableName("items".into()),
                },
                optional: false,
            },
        ],
    }
}

fn query(criterion: QueryCriterion) -> DataStoreQuery {
    DataStoreQuery {
        table_name: TableName("items".into()),
        criterion,
        sorting: vec![],
        max_results: 100,
        attributes: vec![AttributeName("id".into()), AttributeName("members".into())],
    }
}

#[test]
fn lists_round_trip_and_support_membership_empty_filters_and_per_member_counts() {
    let mut store = IndexedDataStore::in_memory().unwrap();
    store.ensure_tables(vec![schema()]).unwrap();
    store
        .mutate(
            &MutationContext::system(),
            DataStoreMutation {
                return_entities: false,
                steps: vec![DataStoreMutationStep::Insert(DataStoreInsertMutation {
                    table_name: TableName("items".into()),
                    columns: vec![
                        AttributeColumn {
                            attribute: AttributeName("id".into()),
                            values: Values::String(vec!["a".into(), "b".into(), "c".into()]),
                        },
                        AttributeColumn {
                            attribute: AttributeName("members".into()),
                            values: Values::ReferenceList(vec![
                                vec!["b".into(), "c".into(), "b".into()],
                                vec!["c".into()],
                                vec![],
                            ]),
                        },
                    ],
                })],
            },
        )
        .unwrap();
    let selected = store
        .query(query(QueryCriterion::Equals {
            attribute: AttributeName("members".into()),
            values: vec!["b".into()],
        }))
        .unwrap();
    assert_eq!(selected.number_of_hits, 1);
    let Values::ReferenceList(values) = &selected.result_columns[1].values else {
        panic!("expected reference list")
    };
    assert_eq!(values[0], ["b", "c", "b"]);
    assert_eq!(
        store
            .query(query(QueryCriterion::Set(AttributeName("members".into()))))
            .unwrap()
            .number_of_hits,
        2
    );
    assert_eq!(
        store
            .query(query(QueryCriterion::Unset(AttributeName(
                "members".into()
            ))))
            .unwrap()
            .number_of_hits,
        1
    );
    let counts = store
        .count(
            &TableName("items".into()),
            &QueryCriterion::MatchAny,
            Some(&AttributeName("members".into())),
            10,
        )
        .unwrap();
    let counts = counts
        .into_iter()
        .map(|count| match count.value {
            Some(DataStoreValue::String(value)) => (value.to_string(), count.count),
            _ => panic!("expected member"),
        })
        .collect::<std::collections::BTreeMap<_, _>>();
    assert_eq!(
        counts,
        std::collections::BTreeMap::from([("b".into(), 1), ("c".into(), 2)])
    );
    let mut sorted = query(QueryCriterion::MatchAny);
    sorted.sorting.push(QuerySort {
        attribute: AttributeName("members".into()),
        direction: QuerySortDirection::Ascending,
    });
    assert!(store.query(sorted).is_err());
    assert!(
        store
            .query(query(QueryCriterion::Contains {
                attribute: AttributeName("members".into()),
                value: "b".into()
            }))
            .is_err()
    );
    assert!(
        store
            .query(query(QueryCriterion::InRange {
                attribute: AttributeName("members".into()),
                minimum: None,
                maximum: None
            }))
            .is_err()
    );
    let serialized = serde_json::to_value(crate::query_command::QueryValues::ReferenceList(vec![
        vec!["a".into()],
    ]))
    .unwrap();
    assert_eq!(
        serialized,
        serde_json::json!({"type": "reference_list", "values": [["a"]]})
    );
}

#[test]
fn rejects_scalar_and_empty_ids_in_reference_lists() {
    let mut store = IndexedDataStore::in_memory().unwrap();
    store.ensure_tables(vec![schema()]).unwrap();
    for values in [
        Values::String(vec!["wrong".into()]),
        Values::ReferenceList(vec![vec!["".into()]]),
    ] {
        assert!(
            store
                .mutate(
                    &MutationContext::system(),
                    DataStoreMutation {
                        return_entities: false,
                        steps: vec![DataStoreMutationStep::Insert(DataStoreInsertMutation {
                            table_name: TableName("items".into()),
                            columns: vec![
                                AttributeColumn {
                                    attribute: AttributeName("id".into()),
                                    values: Values::String(vec!["a".into()])
                                },
                                AttributeColumn {
                                    attribute: AttributeName("members".into()),
                                    values
                                }
                            ],
                        })]
                    }
                )
                .is_err()
        );
    }
}
