use joi_server::data_store::{
    AttributeColumn, AttributeName, ColumnDataType, ColumnDescription, DataStore,
    DataStoreInsertMutation, DataStoreMutation, DataStoreMutationStep, DataStoreQuery,
    QueryCriterion, TableDescription, TableDescriptionProvider, TableName, TestDataProvider,
    Values,
};

/// Contributes the projects used to group tickets and allocate key prefixes.
pub struct ProjectTableDescriptionProvider;

impl TableDescriptionProvider for ProjectTableDescriptionProvider {
    fn table_description(&self) -> TableDescription {
        TableDescription {
            name: TableName("projects".into()),
            discoverable: true,
            columns: vec![
                project_column("id", "Immutable KSUID project identifier"),
                project_column("name", "Human-readable project name"),
                ColumnDescription {
                    name: AttributeName("description".into()),
                    description: "Detailed project description".into(),
                    data_type: ColumnDataType::Text,
                    optional: false,
                },
                project_column("prefix", "Uppercase prefix used for associated ticket keys"),
            ],
        }
    }
}

fn project_column(name: &'static str, description: &'static str) -> ColumnDescription {
    ColumnDescription {
        name: AttributeName(name.into()),
        description: description.into(),
        data_type: ColumnDataType::String,
        optional: false,
    }
}

/// Inserts the default Test and Demo projects for local development.
pub struct ProjectTestDataProvider;

impl TestDataProvider for ProjectTestDataProvider {
    fn insert_test_data(&self, data_store: &mut dyn DataStore) -> joi_error::JoiResult<()> {
        let existing = data_store.query(DataStoreQuery {
            table_name: TableName("projects".into()),
            criterion: QueryCriterion::MatchAny,
            sorting: Vec::new(),
            max_results: 10_000,
            attributes: vec![AttributeName("prefix".into())],
        })?;
        let Values::String(existing_prefixes) = &existing.result_columns[0].values else {
            return Err(joi_error::joi_error!("project prefixes must be strings"));
        };
        let defaults = [
            ("Test", "Project for tests and development fixtures", "TEST"),
            (
                "Demo",
                "Project for demonstrations and exploratory work",
                "DEMO",
            ),
        ];
        let missing = defaults
            .into_iter()
            .filter(|(_, _, prefix)| !existing_prefixes.iter().any(|existing| existing == *prefix))
            .collect::<Vec<_>>();
        if missing.is_empty() {
            return Ok(());
        }

        data_store.mutate(DataStoreMutation {
            return_entities: false,
            steps: vec![DataStoreMutationStep::Insert(DataStoreInsertMutation {
                table_name: TableName("projects".into()),
                columns: vec![
                    string_column(
                        "id",
                        missing.iter().map(|_| ksuid::Ksuid::generate().to_base62()),
                    ),
                    string_column("name", missing.iter().map(|(name, _, _)| *name)),
                    string_column(
                        "description",
                        missing.iter().map(|(_, description, _)| *description),
                    ),
                    string_column("prefix", missing.iter().map(|(_, _, prefix)| *prefix)),
                ],
            })],
        })?;
        Ok(())
    }
}

fn string_column<T: Into<joi_base::JoiString>>(
    name: &'static str,
    values: impl IntoIterator<Item = T>,
) -> AttributeColumn {
    AttributeColumn {
        attribute: AttributeName(name.into()),
        values: Values::String(values.into_iter().map(Into::into).collect()),
    }
}

#[cfg(test)]
mod tests {
    use joi_server::{
        data_store::{
            DataStore, DataStoreQuery, QueryCriterion, TableDescriptionProvider, TableName,
            TestDataProvider, Values,
        },
        storage::IndexedDataStore,
    };

    use super::{ProjectTableDescriptionProvider, ProjectTestDataProvider};

    #[test]
    fn describes_projects() {
        let table = ProjectTableDescriptionProvider.table_description();
        assert_eq!(table.name.0, "projects");
        assert_eq!(
            table
                .columns
                .iter()
                .map(|column| column.name.0.as_str())
                .collect::<Vec<_>>(),
            ["id", "name", "description", "prefix"]
        );
    }

    #[test]
    fn inserts_default_projects_once() {
        let mut store = IndexedDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![ProjectTableDescriptionProvider.table_description()])
            .unwrap();

        ProjectTestDataProvider
            .insert_test_data(&mut store)
            .unwrap();
        ProjectTestDataProvider
            .insert_test_data(&mut store)
            .unwrap();

        let result = store
            .query(DataStoreQuery {
                table_name: TableName("projects".into()),
                criterion: QueryCriterion::MatchAny,
                sorting: Vec::new(),
                max_results: 10,
                attributes: vec![
                    joi_server::data_store::AttributeName("id".into()),
                    joi_server::data_store::AttributeName("name".into()),
                    joi_server::data_store::AttributeName("prefix".into()),
                ],
            })
            .unwrap();
        assert_eq!(result.number_of_hits, 2);
        assert!(matches!(
            &result.result_columns[0].values,
            Values::String(values) if values.iter().all(|value| ksuid::Ksuid::from_base62(value).is_ok())
        ));
        assert!(matches!(
            &result.result_columns[1].values,
            Values::String(values) if values.iter().any(|value| value == "Test") && values.iter().any(|value| value == "Demo")
        ));
        assert!(matches!(
            &result.result_columns[2].values,
            Values::String(values) if values.iter().any(|value| value == "TEST") && values.iter().any(|value| value == "DEMO")
        ));
    }
}
