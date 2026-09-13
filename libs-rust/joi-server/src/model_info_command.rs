use joi_error::JoiResult;
use joi_plugin::PluginRegistry;

use crate::{
    command_handler::CommandHandler,
    data_store::{ColumnDataType, TableDescriptionProvider},
    generated::api::{
        ModelAttributeDescription, ModelAttributeReference, ModelAttributeType, ModelInfoRequest,
        ModelInfoResponse, ModelTypeDescription,
    },
};

/// Returns the discoverable data model contributed by server plugins.
pub struct ModelInfoCommand {
    plugin_registry: PluginRegistry,
}

impl ModelInfoCommand {
    /// Creates a model information command backed by `plugin_registry`.
    pub fn new(plugin_registry: PluginRegistry) -> Self {
        Self { plugin_registry }
    }
}

impl CommandHandler for ModelInfoCommand {
    type Command = ModelInfoRequest;

    fn execute(
        &self,
        _context: &crate::command_handler::CommandContext,
        _request: Self::Command,
    ) -> JoiResult<ModelInfoResponse> {
        let mut models = self
            .plugin_registry
            .extensions::<dyn TableDescriptionProvider>()?
            .map(TableDescriptionProvider::table_description)
            .filter(|table| table.discoverable)
            .map(|table| ModelTypeDescription {
                name: table.name.0.to_string(),
                attributes: table
                    .columns
                    .into_iter()
                    .enumerate()
                    .map(|(index, column)| ModelAttributeDescription {
                        name: column.name.0.to_string(),
                        description: column.description.to_string(),
                        data_type: match column.data_type {
                            ColumnDataType::String => ModelAttributeType::String,
                            ColumnDataType::Int => ModelAttributeType::Int,
                        },
                        optional: column.optional,
                        key: index == 0,
                        references: column.references.map(|reference| ModelAttributeReference {
                            model: reference.table.0.to_string(),
                            attribute: reference.attribute.0.to_string(),
                        }),
                    })
                    .collect(),
            })
            .collect::<Vec<_>>();
        models.sort_by(|left, right| left.name.cmp(&right.name));
        Ok(ModelInfoResponse { models })
    }
}

#[cfg(test)]
mod tests {
    use joi_plugin::{PluginRegistryBuilder, plugin};

    use crate::{
        command_handler::CommandHandler,
        data_store::{
            AttributeName, ColumnDataType, ColumnDescription, TableDescription,
            TableDescriptionProvider, TableName,
        },
        generated::api::{ModelAttributeType, ModelInfoRequest},
    };

    use super::ModelInfoCommand;

    struct TableProvider {
        name: &'static str,
        discoverable: bool,
    }

    impl TableDescriptionProvider for TableProvider {
        fn table_description(&self) -> TableDescription {
            TableDescription {
                name: TableName(self.name.into()),
                discoverable: self.discoverable,
                columns: vec![ColumnDescription {
                    name: AttributeName("id".into()),
                    description: "Stable identifier".into(),
                    data_type: ColumnDataType::String,
                    optional: false,
                    references: None,
                }],
            }
        }
    }

    #[test]
    fn returns_only_discoverable_models_in_name_order() {
        let mut builder = PluginRegistryBuilder::new();
        builder
            .register(plugin("models", "Model test data", |context| {
                context
                    .register_extension_point::<dyn TableDescriptionProvider>("tables", "Tables")?;
                context.register_extension::<dyn TableDescriptionProvider>(
                    "zebra",
                    "Zebra table",
                    Box::new(TableProvider {
                        name: "zebras",
                        discoverable: true,
                    }),
                )?;
                context.register_extension::<dyn TableDescriptionProvider>(
                    "internal",
                    "Internal table",
                    Box::new(TableProvider {
                        name: "internal",
                        discoverable: false,
                    }),
                )?;
                context.register_extension::<dyn TableDescriptionProvider>(
                    "apple",
                    "Apple table",
                    Box::new(TableProvider {
                        name: "apples",
                        discoverable: true,
                    }),
                )
            }))
            .unwrap();

        let response = ModelInfoCommand::new(builder.build())
            .execute(&Default::default(), ModelInfoRequest {})
            .unwrap();

        assert_eq!(
            response
                .models
                .iter()
                .map(|model| model.name.as_str())
                .collect::<Vec<_>>(),
            ["apples", "zebras"]
        );
        assert_eq!(
            response.models[0].attributes[0].data_type,
            ModelAttributeType::String
        );
        assert!(response.models[0].attributes[0].key);
    }
}
