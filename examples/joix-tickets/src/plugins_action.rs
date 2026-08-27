use joi_base::JoiString;
use joi_error::JoiResult;
use joi_plugin::PluginRegistry;
use serde::{Deserialize, Serialize};

use crate::action::{Action, ActionDescriptor, ActionRequest};

pub struct PluginsAction {
    plugin_registry: PluginRegistry,
}

impl PluginsAction {
    pub fn new(plugin_registry: PluginRegistry) -> Self {
        Self { plugin_registry }
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PluginsActionRequest {}

impl ActionRequest for PluginsActionRequest {
    type Response = PluginsActionResponse;
}

#[derive(Debug, PartialEq, Serialize)]
pub struct PluginsActionResponse {
    pub plugins: Vec<PluginSummary>,
    pub extension_points: Vec<ExtensionPointSummary>,
    pub extensions: Vec<ExtensionSummary>,
}

#[derive(Debug, PartialEq, Serialize)]
pub struct PluginSummary {
    pub name: JoiString,
    pub description: JoiString,
    pub extension_points: Vec<JoiString>,
    pub extensions: Vec<JoiString>,
}

#[derive(Debug, PartialEq, Serialize)]
pub struct ExtensionPointSummary {
    pub id: JoiString,
    pub description: JoiString,
    pub extensions: Vec<JoiString>,
}

#[derive(Debug, PartialEq, Serialize)]
pub struct ExtensionSummary {
    pub id: JoiString,
    pub description: JoiString,
}

impl Action for PluginsAction {
    type Request = PluginsActionRequest;

    fn descriptor() -> ActionDescriptor {
        ActionDescriptor {
            name: "plugins".into(),
            description: "Lists all registered plugins".into(),
        }
    }

    fn execute(&self, _request: Self::Request) -> JoiResult<PluginsActionResponse> {
        Ok(PluginsActionResponse {
            plugins: self
                .plugin_registry
                .plugins()
                .map(|plugin| PluginSummary {
                    name: plugin.name.clone(),
                    description: plugin.description.clone(),
                    extension_points: plugin.extension_points.clone(),
                    extensions: plugin.extensions.clone(),
                })
                .collect(),
            extension_points: self
                .plugin_registry
                .extension_points()
                .map(|point| ExtensionPointSummary {
                    id: point.id.clone(),
                    description: point.description.clone(),
                    extensions: point.extensions.clone(),
                })
                .collect(),
            extensions: self
                .plugin_registry
                .extensions_info()
                .map(|extension| ExtensionSummary {
                    id: extension.id.clone(),
                    description: extension.description.clone(),
                })
                .collect(),
        })
    }
}

#[cfg(test)]
mod tests {
    use joi_plugin::{PluginRegistryBuilder, plugin};

    use crate::action::Action;

    use super::{
        ExtensionPointSummary, ExtensionSummary, PluginSummary, PluginsAction,
        PluginsActionRequest, PluginsActionResponse,
    };

    #[test]
    fn lists_plugins_in_registration_order() {
        let mut builder = PluginRegistryBuilder::new();
        trait Example: Send + Sync {}
        struct ExampleExtension;
        impl Example for ExampleExtension {}

        builder
            .register(plugin("infra", "Infrastructure services", |context| {
                context.register_extension_point::<dyn Example>("examples", "Example points")?;
                context.register_extension::<dyn Example>(
                    "example",
                    "Example extension",
                    Box::new(ExampleExtension),
                )
            }))
            .unwrap();
        builder
            .register(plugin("tickets", "Ticket management", |_| Ok(())))
            .unwrap();

        let response = PluginsAction::new(builder.build())
            .execute(PluginsActionRequest {})
            .unwrap();

        assert_eq!(
            response,
            PluginsActionResponse {
                plugins: vec![
                    PluginSummary {
                        name: "infra".into(),
                        description: "Infrastructure services".into(),
                        extension_points: vec!["examples".into()],
                        extensions: vec!["example".into()],
                    },
                    PluginSummary {
                        name: "tickets".into(),
                        description: "Ticket management".into(),
                        extension_points: Vec::new(),
                        extensions: Vec::new(),
                    },
                ],
                extension_points: vec![ExtensionPointSummary {
                    id: "examples".into(),
                    description: "Example points".into(),
                    extensions: vec!["example".into()],
                }],
                extensions: vec![ExtensionSummary {
                    id: "example".into(),
                    description: "Example extension".into(),
                }],
            }
        );
    }
}
