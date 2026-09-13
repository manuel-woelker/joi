use joi_plugin::{Plugin, plugin};
use joi_server::data_store::{
    AttributeName, ColumnDataType, ColumnDescription, TableDescription, TableDescriptionProvider,
    TableName,
};

/// Creates the Codevette trunk-based code review server plugin.
pub fn codevette_plugin() -> Plugin {
    plugin("codevette", "Trunk-based code review", |context| {
        context.register_extension::<dyn TableDescriptionProvider>(
            "repositories-table",
            "Defines repositories available for code review",
            Box::new(RepositoryTableDescriptionProvider),
        )
    })
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

#[cfg(test)]
mod tests {
    use joi_server::data_store::TableDescriptionProvider;

    use super::RepositoryTableDescriptionProvider;

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
}
