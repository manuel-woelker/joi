use std::collections::BTreeMap;

use crate::command::Command;
use crate::command_handler::CommandHandler;
use joi_base::JoiString;
use joi_error::JoiResult;
use joi_plugin::PluginRegistry;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

/// Contributes key-value pairs to the application information response.
pub trait InfoProvider: Send + Sync {
    /// Adds this provider's information to `collector`.
    fn collect_info(&self, collector: &mut InfoCollector);
}

#[derive(Default)]
/// Collects application information in deterministic key order.
pub struct InfoCollector {
    info: BTreeMap<JoiString, JsonValue>,
}

impl InfoCollector {
    /// Adds or replaces an information value under `key`.
    pub fn add_info(&mut self, key: impl Into<JoiString>, value: JsonValue) {
        self.info.insert(key.into(), value);
    }
}

/// Handles the built-in `info` command using registered [`InfoProvider`] extensions.
pub struct InfoCommand {
    plugin_registry: PluginRegistry,
}

impl InfoCommand {
    /// Creates an information command backed by `plugin_registry`.
    pub fn new(plugin_registry: PluginRegistry) -> Self {
        Self { plugin_registry }
    }

    #[cfg(test)]
    /// Creates an information command with an empty plugin registry for tests.
    pub fn new_empty() -> Self {
        Self::new(joi_plugin::PluginRegistryBuilder::new().build())
    }
}

#[derive(Debug, Serialize)]
/// Flattened information returned by the `info` command.
pub struct InfoCommandResponse {
    /// Information collected from all registered providers.
    #[serde(flatten)]
    pub info: BTreeMap<JoiString, JsonValue>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
/// Empty request for the `info` command.
pub struct InfoCommandRequest {}

impl Command for InfoCommandRequest {
    const NAME: &'static str = "info";
    const DESCRIPTION: &'static str = "Retrieves application information";
    type Response = InfoCommandResponse;
}

impl CommandHandler for InfoCommand {
    type Command = InfoCommandRequest;

    fn execute(
        &self,
        _context: &crate::command_handler::CommandContext,
        _request: Self::Command,
    ) -> JoiResult<InfoCommandResponse> {
        let mut collector = InfoCollector::default();
        for provider in self.plugin_registry.extensions::<dyn InfoProvider>()? {
            provider.collect_info(&mut collector);
        }
        Ok(InfoCommandResponse {
            info: collector.info,
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::command::Command;
    use crate::command_handler::CommandHandler;

    use super::{InfoCommand, InfoCommandRequest};

    #[test]
    fn describes_the_info_command() {
        assert_eq!(InfoCommandRequest::NAME, "info");
        assert_eq!(
            InfoCommandRequest::DESCRIPTION,
            "Retrieves application information"
        );
    }

    #[test]
    fn requires_the_info_provider_extension_point() {
        let response = InfoCommand::new_empty().execute(&Default::default(), InfoCommandRequest {});

        assert!(response.is_err());
    }
}
