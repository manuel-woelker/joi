use crate::{
    data_store::*, model_validation::ModelValidator, mutation_contributor::MutationContext,
    storage::IndexedDataStore, user_session_command::UserTableDescriptionProvider,
};

fn strings(attribute: &str, values: &[&str]) -> AttributeColumn {
    AttributeColumn {
        attribute: AttributeName(attribute.into()),
        values: Values::String(values.iter().map(|value| (*value).into()).collect()),
    }
}

fn query() -> DataStoreQuery {
    DataStoreQuery {
        table_name: TableName("users".into()),
        criterion: QueryCriterion::MatchAny,
        sorting: vec![],
        max_results: 10,
        attributes: vec![AttributeName("name".into())],
    }
}

#[test]
fn validates_complete_chunks_before_entities_or_index_are_written() {
    let mut store = IndexedDataStore::in_memory().unwrap();
    store
        .ensure_tables(vec![UserTableDescriptionProvider.table_description()])
        .unwrap();
    let insert = |names: &[&str]| DataStoreMutation {
        return_entities: true,
        steps: vec![DataStoreMutationStep::Insert(DataStoreInsertMutation {
            table_name: TableName("users".into()),
            columns: vec![
                strings("id", &["u1", "u2"]),
                strings("username", &["jane", "joe"]),
                strings("name", names),
            ],
        })],
    };
    let error = store
        .mutate(
            &MutationContext::system(),
            insert(&["Jane Developer", "Joe 123"]),
        )
        .err()
        .expect("invalid name must fail");
    assert!(format!("{error:?}").contains("users.name"));
    assert_eq!(store.query(query()).unwrap().number_of_hits, 0);
    let result = store
        .mutate(
            &MutationContext::system(),
            insert(&["Jane Developer", "José O’Connor"]),
        )
        .unwrap();
    assert_eq!(result.entities.unwrap().len(), 2);
    let update = |name: &str| DataStoreMutation {
        return_entities: false,
        steps: vec![DataStoreMutationStep::Update(DataStoreUpdateMutation {
            table_name: TableName("users".into()),
            ids: vec!["u1".into()],
            columns: vec![strings("name", &[name])],
        })],
    };
    for name in [" ", "Jane 123"] {
        assert!(
            store
                .mutate(&MutationContext::system(), update(name))
                .is_err()
        );
    }
    let before = store.query(query()).unwrap();
    assert!(
        matches!(&before.result_columns[0].values, Values::String(values) if values.iter().any(|value| value == "Jane Developer"))
    );
    store
        .mutate(&MutationContext::system(), update("Jane Updated"))
        .unwrap();
    assert!(
        matches!(&store.query(query()).unwrap().result_columns[0].values, Values::String(values) if values.iter().any(|value| value == "Jane Updated"))
    );
}

#[test]
fn rejects_invalid_metadata_at_registration() {
    let schema = UserTableDescriptionProvider.table_description();
    let mut invalid = schema.clone();
    invalid.presentation.as_mut().unwrap().label_template = "${unknown}".into();
    assert!(ModelValidator::compile(&invalid).is_err());
    invalid = schema.clone();
    invalid.presentation.as_mut().unwrap().fields[2].validation[1].pattern = Some("[".into());
    assert!(ModelValidator::compile(&invalid).is_err());
    invalid = schema;
    invalid.presentation.as_mut().unwrap().fields.pop();
    assert!(ModelValidator::compile(&invalid).is_err());
}

#[test]
fn required_rich_text_rejects_empty_markup() {
    let mut schema = UserTableDescriptionProvider.table_description();
    let name = &mut schema.presentation.as_mut().unwrap().fields[2];
    name.control = crate::generated::api::ModelControl::Html;
    name.validation.truncate(1);
    let validator = ModelValidator::compile(&schema).unwrap();
    for text in ["", "<p><br></p>", "<p>&nbsp;</p>"] {
        assert!(
            validator
                .validate(
                    &schema,
                    &serde_json::json!({"username": "jane", "name": text})
                        .as_object()
                        .unwrap()
                        .clone()
                )
                .is_err()
        );
    }
    assert!(
        validator
            .validate(
                &schema,
                serde_json::json!({"username": "jane", "name": "<p>Jane</p>"})
                    .as_object()
                    .unwrap()
            )
            .is_ok()
    );
}
