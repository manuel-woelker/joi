use joi_base::JoiString;
use joi_error::JoiResult;
use joi_plugin::PluginRegistry;
use serde::{Deserialize, Serialize};

use crate::command::Command;
use crate::command_handler::CommandHandler;

/// Handles inspection of the server's plugin registry.
pub struct PluginsCommand {
    plugin_registry: PluginRegistry,
}

impl PluginsCommand {
    /// Creates a plugin inventory command backed by `plugin_registry`.
    pub fn new(plugin_registry: PluginRegistry) -> Self {
        Self { plugin_registry }
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
/// Empty request for the `plugins` command.
pub struct PluginsCommandRequest {}

impl Command for PluginsCommandRequest {
    const NAME: &'static str = "plugins";
    const DESCRIPTION: &'static str = "Lists all registered plugins";
    type Response = PluginsCommandResponse;
}

#[derive(Debug, PartialEq, Serialize)]
/// Complete flat inventory of plugins, extension points, and extensions.
pub struct PluginsCommandResponse {
    /// Registered plugins in registration order.
    pub plugins: Vec<PluginSummary>,
    /// Registered extension points in registration order.
    pub extension_points: Vec<ExtensionPointSummary>,
    /// Registered extensions in registration order.
    pub extensions: Vec<ExtensionSummary>,
}

#[derive(Debug, PartialEq, Serialize)]
/// Serializable metadata for one registered plugin.
pub struct PluginSummary {
    /// Plugin name.
    pub name: JoiString,
    /// Human-readable plugin description.
    pub description: JoiString,
    /// Source file that registered the plugin.
    pub file: JoiString,
    /// Source line that registered the plugin.
    pub line: u32,
    /// IDs of extension points declared by the plugin.
    pub extension_points: Vec<JoiString>,
    /// IDs of extensions contributed by the plugin.
    pub extensions: Vec<JoiString>,
}

#[derive(Debug, PartialEq, Serialize)]
/// Serializable metadata for one registered extension point.
pub struct ExtensionPointSummary {
    /// Stable extension point ID.
    pub id: JoiString,
    /// Human-readable extension point description.
    pub description: JoiString,
    /// Source file that registered the extension point.
    pub file: JoiString,
    /// Source line that registered the extension point.
    pub line: u32,
    /// IDs of extensions contributed to the extension point.
    pub extensions: Vec<JoiString>,
}

#[derive(Debug, PartialEq, Serialize)]
/// Serializable metadata for one registered extension.
pub struct ExtensionSummary {
    /// Stable extension ID.
    pub id: JoiString,
    /// Human-readable extension description.
    pub description: JoiString,
    /// Source file that registered the extension.
    pub file: JoiString,
    /// Source line that registered the extension.
    pub line: u32,
}

impl CommandHandler for PluginsCommand {
    type Command = PluginsCommandRequest;

    fn execute(
        &self,
        _context: &crate::command_handler::CommandContext,
        _request: Self::Command,
    ) -> JoiResult<PluginsCommandResponse> {
        Ok(PluginsCommandResponse {
            plugins: self
                .plugin_registry
                .plugins()
                .map(|plugin| PluginSummary {
                    name: plugin.name.clone(),
                    description: plugin.description.clone(),
                    file: plugin.location.file.clone(),
                    line: plugin.location.line,
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
                    file: point.location.file.clone(),
                    line: point.location.line,
                    extensions: point.extensions.clone(),
                })
                .collect(),
            extensions: self
                .plugin_registry
                .extensions_info()
                .map(|extension| ExtensionSummary {
                    id: extension.id.clone(),
                    description: extension.description.clone(),
                    file: extension.location.file.clone(),
                    line: extension.location.line,
                })
                .collect(),
        })
    }
}

#[cfg(test)]
mod tests {
    use joi_plugin::{PluginRegistryBuilder, plugin};

    use crate::command_handler::CommandHandler;

    use super::{
        ExtensionPointSummary, ExtensionSummary, PluginSummary, PluginsCommand,
        PluginsCommandRequest, PluginsCommandResponse,
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
            .register(plugin("sample", "Sample application", |_| Ok(())))
            .unwrap();

        let mut response = PluginsCommand::new(builder.build())
            .execute(&Default::default(), PluginsCommandRequest {})
            .unwrap();

        for plugin in &mut response.plugins {
            assert_eq!(plugin.file, file!());
            assert!(plugin.line > 0);
            plugin.file = "<source>".into();
            plugin.line = 0;
        }
        for extension_point in &mut response.extension_points {
            assert_eq!(extension_point.file, file!());
            assert!(extension_point.line > 0);
            extension_point.file = "<source>".into();
            extension_point.line = 0;
        }
        for extension in &mut response.extensions {
            assert_eq!(extension.file, file!());
            assert!(extension.line > 0);
            extension.file = "<source>".into();
            extension.line = 0;
        }

        assert_eq!(
            response,
            PluginsCommandResponse {
                plugins: vec![
                    PluginSummary {
                        name: "infra".into(),
                        description: "Infrastructure services".into(),
                        file: "<source>".into(),
                        line: 0,
                        extension_points: vec!["examples".into()],
                        extensions: vec!["example".into()],
                    },
                    PluginSummary {
                        name: "sample".into(),
                        description: "Sample application".into(),
                        file: "<source>".into(),
                        line: 0,
                        extension_points: Vec::new(),
                        extensions: Vec::new(),
                    },
                ],
                extension_points: vec![ExtensionPointSummary {
                    id: "examples".into(),
                    description: "Example points".into(),
                    file: "<source>".into(),
                    line: 0,
                    extensions: vec!["example".into()],
                }],
                extensions: vec![ExtensionSummary {
                    id: "example".into(),
                    description: "Example extension".into(),
                    file: "<source>".into(),
                    line: 0,
                }],
            }
        );
    }
}
