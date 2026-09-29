use joi_server::data_store::{
    AttributeName, ColumnDataType, ColumnDescription, TableDescription, TableDescriptionProvider,
    TableName,
};

/// One shared unpublished draft per published wiki page, keyed by the same ID.
pub struct WikiDraftTableDescriptionProvider;

impl TableDescriptionProvider for WikiDraftTableDescriptionProvider {
    fn table_description(&self) -> TableDescription {
        TableDescription {
            name: TableName("wikipage_drafts".into()),
            discoverable: false,
            presentation: None,
            columns: [
                ("id", ColumnDataType::String),
                ("title", ColumnDataType::String),
                ("content", ColumnDataType::Text),
            ]
            .into_iter()
            .map(|(name, data_type)| ColumnDescription {
                name: AttributeName(name.into()),
                description: format!("Wiki draft {name}").into(),
                data_type,
                optional: false,
            })
            .collect(),
        }
    }
}
