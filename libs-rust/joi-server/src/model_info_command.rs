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
        use crate::data_store::TableDescription;
        use joi_error::{JoiResult, joi_error};

        fn primary_key(table: &TableDescription) -> JoiResult<&str> {
            table
                .columns
                .first()
                .map(|column| column.name.0.as_str())
                .ok_or_else(|| joi_error!("entity type `{}` defines no attributes", table.name.0))
        }

        let tables = self
            .plugin_registry
            .extensions::<dyn TableDescriptionProvider>()?
            .map(TableDescriptionProvider::table_description)
            .filter(|table| table.discoverable)
            .collect::<Vec<_>>();
        let mut models = tables
            .iter()
            .map(|table| {
                let attributes = table
                    .columns
                    .iter()
                    .enumerate()
                    .map(|(index, column)| {
                        let data_type = match &column.data_type {
                            // Text and references are physically stored as strings.
                            ColumnDataType::String
                            | ColumnDataType::Text
                            | ColumnDataType::Reference { .. } => ModelAttributeType::String,
                            ColumnDataType::Int => ModelAttributeType::Int,
                        };
                        let references = match &column.data_type {
                            // References always address the target's primary key.
                            ColumnDataType::Reference { entity } => {
                                let target = tables
                                    .iter()
                                    .find(|candidate| candidate.name == *entity)
                                    .ok_or_else(|| {
                                        joi_error!(
                                            "entity type `{}` references unknown entity type `{}`",
                                            table.name.0,
                                            entity.0
                                        )
                                    })?;
                                Some(ModelAttributeReference {
                                    model: entity.0.to_string(),
                                    attribute: primary_key(target)?.to_owned(),
                                })
                            }
                            _ => None,
                        };
                        Ok(ModelAttributeDescription {
                            name: column.name.0.to_string(),
                            description: column.description.to_string(),
                            data_type,
                            optional: column.optional,
                            key: index == 0,
                            references,
                        })
                    })
                    .collect::<JoiResult<Vec<_>>>()?;
                Ok(ModelTypeDescription {
                    name: table.name.0.to_string(),
                    attributes,
                })
            })
            .collect::<JoiResult<Vec<_>>>()?;
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
        reference: Option<&'static str>,
    }

    impl TableDescriptionProvider for TableProvider {
        fn table_description(&self) -> TableDescription {
            let mut columns = vec![ColumnDescription {
                name: AttributeName("id".into()),
                description: "Stable identifier".into(),
                data_type: ColumnDataType::String,
                optional: false,
            }];
            if let Some(entity) = self.reference {
                columns.push(ColumnDescription {
                    name: AttributeName("owner".into()),
                    description: "Owning record".into(),
                    data_type: ColumnDataType::Reference {
                        entity: TableName(entity.into()),
                    },
                    optional: false,
                });
            }
            TableDescription {
                name: TableName(self.name.into()),
                discoverable: self.discoverable,
                columns,
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
                        reference: None,
                    }),
                )?;
                context.register_extension::<dyn TableDescriptionProvider>(
                    "internal",
                    "Internal table",
                    Box::new(TableProvider {
                        name: "internal",
                        discoverable: false,
                        reference: None,
                    }),
                )?;
                context.register_extension::<dyn TableDescriptionProvider>(
                    "apple",
                    "Apple table",
                    Box::new(TableProvider {
                        name: "apples",
                        discoverable: true,
                        reference: Some("zebras"),
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
        // References report the target entity and its primary key.
        let owner = &response.models[0].attributes[1];
        assert_eq!(owner.data_type, ModelAttributeType::String);
        assert!(!owner.key);
        let reference = owner.references.as_ref().expect("owner references zebras");
        assert_eq!(reference.model, "zebras");
        assert_eq!(reference.attribute, "id");
    }
}
