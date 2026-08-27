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
}

#[derive(Debug, PartialEq, Serialize)]
pub struct PluginSummary {
    pub name: JoiString,
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
                })
                .collect(),
        })
    }
}

#[cfg(test)]
mod tests {
    use joi_plugin::{PluginRegistryBuilder, plugin};

    use crate::action::Action;

    use super::{PluginSummary, PluginsAction, PluginsActionRequest, PluginsActionResponse};

    #[test]
    fn lists_plugins_in_registration_order() {
        let mut builder = PluginRegistryBuilder::new();
        builder
            .register(plugin("infra", "Infrastructure services", |_| Ok(())))
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
                    },
                    PluginSummary {
                        name: "tickets".into(),
                        description: "Ticket management".into(),
                    },
                ],
            }
        );
    }
}
