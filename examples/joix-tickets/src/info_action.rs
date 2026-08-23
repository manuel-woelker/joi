use std::collections::BTreeMap;

use crate::action::{Action, ActionDescriptor, ActionRequest};
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

pub struct InfoAction {
    plugin_registry: PluginRegistry,
}

impl InfoAction {
    pub fn new(plugin_registry: PluginRegistry) -> Self {
        Self { plugin_registry }
    }

    #[cfg(test)]
    pub fn new_empty() -> Self {
        Self::new(PluginRegistry::new())
    }
}

#[derive(Debug, Serialize)]
pub struct InfoActionResponse {
    #[serde(flatten)]
    pub info: BTreeMap<JoiString, JsonValue>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InfoActionRequest {}

impl ActionRequest for InfoActionRequest {
    type Response = InfoActionResponse;
}

impl Action for InfoAction {
    type Request = InfoActionRequest;

    fn descriptor() -> ActionDescriptor {
        ActionDescriptor {
            name: "info".into(),
            description: "Retrieves application information".into(),
        }
    }

    fn execute(&self, _request: Self::Request) -> JoiResult<InfoActionResponse> {
        let mut collector = InfoCollector::default();
        let providers = self.plugin_registry.extensions::<dyn InfoProvider>()?;
        for provider in providers.iter() {
            provider.collect_info(&mut collector);
        }
        Ok(InfoActionResponse {
            info: collector.info,
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::action::Action;

    use super::{InfoAction, InfoActionRequest};

    #[test]
    fn describes_the_info_action() {
        let descriptor = InfoAction::descriptor();

        assert_eq!(descriptor.name, "info");
        assert_eq!(descriptor.description, "Retrieves application information");
    }

    #[test]
    fn requires_the_info_provider_extension_point() {
        let response = InfoAction::new_empty().execute(InfoActionRequest {});

        assert!(response.is_err());
    }
}
