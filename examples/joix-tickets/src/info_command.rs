use std::collections::BTreeMap;

use crate::command::{Command, CommandDescriptor, CommandRequest};
use joi_base::JoiString;
use joi_error::JoiResult;
use joi_plugin::PluginRegistry;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

pub trait InfoProvider: Send + Sync {
    fn collect_info(&self, collector: &mut InfoCollector);
}

#[derive(Default)]
pub struct InfoCollector {
    info: BTreeMap<JoiString, JsonValue>,
}

impl InfoCollector {
    pub fn add_info(&mut self, key: impl Into<JoiString>, value: JsonValue) {
        self.info.insert(key.into(), value);
    }
}

pub struct InfoCommand {
    plugin_registry: PluginRegistry,
}

impl InfoCommand {
    pub fn new(plugin_registry: PluginRegistry) -> Self {
        Self { plugin_registry }
    }

    #[cfg(test)]
    pub fn new_empty() -> Self {
        Self::new(joi_plugin::PluginRegistryBuilder::new().build())
    }
}

#[derive(Debug, Serialize)]
pub struct InfoCommandResponse {
    #[serde(flatten)]
    pub info: BTreeMap<JoiString, JsonValue>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InfoCommandRequest {}

impl CommandRequest for InfoCommandRequest {
    type Response = InfoCommandResponse;
}

impl Command for InfoCommand {
    type Request = InfoCommandRequest;

    fn descriptor() -> CommandDescriptor {
        CommandDescriptor {
            name: "info".into(),
            description: "Retrieves application information".into(),
        }
    }

    fn execute(&self, _request: Self::Request) -> JoiResult<InfoCommandResponse> {
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

    use super::{InfoCommand, InfoCommandRequest};

    #[test]
    fn describes_the_info_command() {
        let descriptor = InfoCommand::descriptor();

        assert_eq!(descriptor.name, "info");
        assert_eq!(descriptor.description, "Retrieves application information");
    }

    #[test]
    fn requires_the_info_provider_extension_point() {
        let response = InfoCommand::new_empty().execute(InfoCommandRequest {});

        assert!(response.is_err());
    }
}
