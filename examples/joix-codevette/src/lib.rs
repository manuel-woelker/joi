use std::path::PathBuf;

use joi_plugin::{Plugin, plugin};
use joi_server::data_store::{
    AttributeColumn, AttributeName, ColumnDataType, ColumnDescription, ColumnReference, DataStore,
    DataStoreInsertMutation, DataStoreMutation, DataStoreMutationStep, DataStoreQuery,
    QueryCriterion, TableDescription, TableDescriptionProvider, TableName, TestDataProvider,
    Values,
};

/// Creates the Codevette trunk-based code review server plugin.
pub fn codevette_plugin() -> Plugin {
    plugin("codevette", "Trunk-based code review", |context| {
        context.register_extension::<dyn TableDescriptionProvider>(
            "repositories-table",
            "Defines repositories available for code review",
            Box::new(RepositoryTableDescriptionProvider),
        )?;
        context.register_extension::<dyn TableDescriptionProvider>(
            "repository-branches-table",
            "Defines branches belonging to configured repositories",
            Box::new(RepositoryBranchTableDescriptionProvider),
        )?;
        context.register_extension::<dyn TestDataProvider>(
            "current-repository",
            "Registers the current Git repository for code review",
            Box::new(CurrentRepositoryProvider::from_current_directory()?),
        )
    })
}

/// Contributes branches belonging to configured repositories.
pub struct RepositoryBranchTableDescriptionProvider;

impl TableDescriptionProvider for RepositoryBranchTableDescriptionProvider {
    fn table_description(&self) -> TableDescription {
        TableDescription {
            name: TableName("repository_branches".into()),
            discoverable: true,
            columns: vec![
                repository_column("id", "Immutable KSUID branch identifier"),
                ColumnDescription {
                    name: AttributeName("repository_id".into()),
                    description: "Repository containing the branch".into(),
                    data_type: ColumnDataType::String,
                    optional: false,
                    references: Some(ColumnReference {
                        table: TableName("repositories".into()),
                        attribute: AttributeName("id".into()),
                    }),
                },
                repository_column("name", "Git branch name"),
            ],
        }
    }
}

/// Contributes repositories configured for code review.
pub struct RepositoryTableDescriptionProvider;

impl TableDescriptionProvider for RepositoryTableDescriptionProvider {
    fn table_description(&self) -> TableDescription {
        TableDescription {
            name: TableName("repositories".into()),
            discoverable: true,
            columns: vec![
                repository_column("id", "Immutable KSUID repository identifier"),
                repository_column("key", "Stable short key identifying the repository"),
                repository_column("name", "Human-readable repository name"),
                repository_column("path", "Local filesystem path to the repository"),
            ],
        }
    }
}

fn repository_column(name: &'static str, description: &'static str) -> ColumnDescription {
    ColumnDescription {
        name: AttributeName(name.into()),
        description: description.into(),
        data_type: ColumnDataType::String,
        optional: false,
        references: None,
    }
}

/// Inserts the Git repository containing the running example application.
pub struct CurrentRepositoryProvider {
    git_directory: PathBuf,
}

impl CurrentRepositoryProvider {
    fn from_current_directory() -> joi_error::JoiResult<Self> {
        let current_directory = std::env::current_dir().map_err(|error| {
            joi_error::joi_error!("failed to resolve the current directory: {error}")
        })?;
        let git_directory = current_directory
            .join(".git")
            .canonicalize()
            .map_err(|error| {
                joi_error::joi_error!(
                    "failed to resolve Git directory `{}`: {error}",
                    current_directory.join(".git").display()
                )
            })?;
        Ok(Self { git_directory })
    }

    #[cfg(test)]
    fn with_git_directory(git_directory: impl Into<PathBuf>) -> Self {
        Self {
            git_directory: git_directory.into(),
        }
    }
}

impl TestDataProvider for CurrentRepositoryProvider {
    fn insert_test_data(&self, data_store: &mut dyn DataStore) -> joi_error::JoiResult<()> {
        let path = self.git_directory.to_string_lossy();
        let existing = data_store.query(DataStoreQuery {
            table_name: TableName("repositories".into()),
            criterion: QueryCriterion::Equals {
                attribute: AttributeName("path".into()),
                values: vec![path.as_ref().into()],
            },
            max_results: 1,
            attributes: vec![AttributeName("id".into())],
        })?;
        let repository_id = match &existing.result_columns[0].values {
            Values::String(values) => values.first().cloned(),
            _ => return Err(joi_error::joi_error!("repository IDs must be strings")),
        };
        let repository_id =
            repository_id.unwrap_or_else(|| ksuid::Ksuid::generate().to_base62().into());

        let existing_branch = data_store.query(DataStoreQuery {
            table_name: TableName("repository_branches".into()),
            criterion: QueryCriterion::All(vec![
                QueryCriterion::Equals {
                    attribute: AttributeName("repository_id".into()),
                    values: vec![repository_id.clone()],
                },
                QueryCriterion::Equals {
                    attribute: AttributeName("name".into()),
                    values: vec!["main".into()],
                },
            ]),
            max_results: 1,
            attributes: vec![AttributeName("id".into())],
        })?;

        data_store.mutate(DataStoreMutation {
            steps: [
                (existing.number_of_hits == 0).then(|| {
                    DataStoreMutationStep::Insert(DataStoreInsertMutation {
                        table_name: TableName("repositories".into()),
                        columns: vec![
                            string_column("id", repository_id.clone()),
                            string_column("key", "joi"),
                            string_column("name", "Joi"),
                            string_column("path", path.as_ref()),
                        ],
                    })
                }),
                (existing_branch.number_of_hits == 0).then(|| {
                    DataStoreMutationStep::Insert(DataStoreInsertMutation {
                        table_name: TableName("repository_branches".into()),
                        columns: vec![
                            string_column("id", ksuid::Ksuid::generate().to_base62()),
                            string_column("repository_id", repository_id),
                            string_column("name", "main"),
                        ],
                    })
                }),
            ]
            .into_iter()
            .flatten()
            .collect(),
        })?;
        Ok(())
    }
}

fn string_column(name: &'static str, value: impl Into<joi_base::JoiString>) -> AttributeColumn {
    AttributeColumn {
        attribute: AttributeName(name.into()),
        values: Values::String(vec![value.into()]),
    }
}

#[cfg(test)]
mod tests {
    use joi_server::{
        data_store::{
            DataStore, DataStoreQuery, QueryCriterion, TableDescriptionProvider, TableName,
            TestDataProvider, Values,
        },
        sqlite_data_store::SqliteDataStore,
    };

    use super::{
        CurrentRepositoryProvider, RepositoryBranchTableDescriptionProvider,
        RepositoryTableDescriptionProvider,
    };

    #[test]
    fn describes_repositories() {
        let table = RepositoryTableDescriptionProvider.table_description();

        assert_eq!(table.name.0, "repositories");
        assert!(table.discoverable);
        assert_eq!(
            table
                .columns
                .iter()
                .map(|column| column.name.0.as_str())
                .collect::<Vec<_>>(),
            ["id", "key", "name", "path"]
        );
        assert!(table.columns.iter().all(|column| !column.optional));
    }

    #[test]
    fn inserts_the_current_repository_once() {
        let mut store = SqliteDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![
                RepositoryTableDescriptionProvider.table_description(),
                RepositoryBranchTableDescriptionProvider.table_description(),
            ])
            .unwrap();
        let provider = CurrentRepositoryProvider::with_git_directory("/workspace/joi/.git");

        provider.insert_test_data(&mut store).unwrap();
        provider.insert_test_data(&mut store).unwrap();

        let result = store
            .query(DataStoreQuery {
                table_name: TableName("repositories".into()),
                criterion: QueryCriterion::MatchAny,
                max_results: 10,
                attributes: vec![
                    joi_server::data_store::AttributeName("key".into()),
                    joi_server::data_store::AttributeName("name".into()),
                    joi_server::data_store::AttributeName("path".into()),
                ],
            })
            .unwrap();

        assert_eq!(result.number_of_hits, 1);
        assert!(
            matches!(&result.result_columns[0].values, Values::String(values) if values[0] == "joi")
        );
        assert!(
            matches!(&result.result_columns[1].values, Values::String(values) if values[0] == "Joi")
        );
        assert!(
            matches!(&result.result_columns[2].values, Values::String(values) if values[0] == "/workspace/joi/.git")
        );

        let branches = store
            .query(DataStoreQuery {
                table_name: TableName("repository_branches".into()),
                criterion: QueryCriterion::MatchAny,
                max_results: 10,
                attributes: vec![joi_server::data_store::AttributeName("name".into())],
            })
            .unwrap();
        assert_eq!(branches.number_of_hits, 1);
        assert!(
            matches!(&branches.result_columns[0].values, Values::String(values) if values[0] == "main")
        );
    }
}
