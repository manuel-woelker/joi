use std::{collections::HashMap, sync::Arc};

use joi_base::JoiString;
use joi_error::{JoiResult, joi_bail, report};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;

use crate::action::{Action, ActionDescriptor, ActionRequest};

const ACTIONS_LIST_NAME: &str = "actions/list";

type ExecuteAction = Arc<dyn Fn(Value) -> JoiResult<Value> + Send + Sync>;

struct RegisteredAction {
    descriptor: ActionDescriptor,
    execute: ExecuteAction,
}

/// Stores typed actions without coupling registration to a transport.
#[derive(Clone)]
pub struct ActionRegistry {
    inner: Arc<ActionRegistryInner>,
}

struct ActionRegistryInner {
    actions: HashMap<JoiString, RegisteredAction>,
}

/// Collects actions before producing an immutable [`ActionRegistry`].
#[derive(Default)]
pub struct ActionRegistryBuilder {
    actions: HashMap<JoiString, RegisteredAction>,
}

impl ActionRegistryBuilder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register<A>(&mut self, action: A) -> JoiResult<()>
    where
        A: Action + Send + Sync + 'static,
    {
        let descriptor = A::descriptor();
        if !is_valid_action_name(&descriptor.name) {
            joi_bail!("invalid action name `{}`", descriptor.name);
        }
        if descriptor.name == ACTIONS_LIST_NAME || self.actions.contains_key(&descriptor.name) {
            joi_bail!("action `{}` is already registered", descriptor.name);
        }

        self.actions.insert(
            descriptor.name.clone(),
            RegisteredAction {
                descriptor,
                execute: Arc::new(move |request| {
                    execute_typed::<A::Request>(request, |request| action.execute(request))
                }),
            },
        );
        Ok(())
    }

    pub fn build(mut self) -> ActionRegistry {
        let descriptor = ActionDescriptor {
            name: ACTIONS_LIST_NAME.into(),
            description: "Lists all registered actions".into(),
        };
        let mut actions = self
            .actions
            .values()
            .map(|action| ActionSummary::from(&action.descriptor))
            .chain(std::iter::once(ActionSummary::from(&descriptor)))
            .collect::<Vec<_>>();
        actions.sort_by(|left, right| left.name.cmp(&right.name));
        let actions = Arc::new(actions);
        self.actions.insert(
            descriptor.name.clone(),
            RegisteredAction {
                descriptor,
                execute: Arc::new(move |request| {
                    execute_typed::<ActionsListRequest>(request, |_| {
                        Ok(ActionsListResponse {
                            actions: actions.as_ref().clone(),
                        })
                    })
                }),
            },
        );

        ActionRegistry {
            inner: Arc::new(ActionRegistryInner {
                actions: self.actions,
            }),
        }
    }
}

impl ActionRegistry {
    pub fn descriptor(&self, name: &str) -> Option<&ActionDescriptor> {
        self.inner
            .actions
            .get(name)
            .map(|action| &action.descriptor)
    }

    pub fn descriptors(&self) -> impl Iterator<Item = &ActionDescriptor> {
        self.inner.actions.values().map(|action| &action.descriptor)
    }

    pub fn execute(&self, name: &str, request: Value) -> Option<JoiResult<Value>> {
        self.inner
            .actions
            .get(name)
            .map(|action| (action.execute)(request))
    }
}

fn execute_typed<R>(
    request: Value,
    execute: impl FnOnce(R) -> JoiResult<R::Response>,
) -> JoiResult<Value>
where
    R: ActionRequest + DeserializeOwned,
{
    let request = serde_json::from_value::<R>(request).map_err(report)?;
    let response = execute(request)?;
    serde_json::to_value(response).map_err(report)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ActionsListRequest {}

#[derive(Serialize)]
struct ActionsListResponse {
    actions: Vec<ActionSummary>,
}

impl ActionRequest for ActionsListRequest {
    type Response = ActionsListResponse;
}

#[derive(Clone, Serialize)]
struct ActionSummary {
    name: JoiString,
    description: JoiString,
}

impl From<&ActionDescriptor> for ActionSummary {
    fn from(descriptor: &ActionDescriptor) -> Self {
        Self {
            name: descriptor.name.clone(),
            description: descriptor.description.clone(),
        }
    }
}

fn is_valid_action_name(name: &str) -> bool {
    name.split('/').all(|segment| {
        !segment.is_empty()
            && segment
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use crate::info_action::InfoAction;

    use super::ActionRegistryBuilder;

    #[test]
    fn builds_a_cloneable_immutable_registry() {
        let mut builder = ActionRegistryBuilder::new();
        builder.register(InfoAction::new_empty()).unwrap();

        let original = builder.build();
        let cloned = original.clone();

        assert!(original.descriptor("info").is_some());
        assert!(original.descriptor("actions/list").is_some());
        assert!(cloned.descriptor("info").is_some());
    }

    #[test]
    fn built_in_action_lists_the_registry_snapshot_in_name_order() {
        let mut builder = ActionRegistryBuilder::new();
        builder.register(InfoAction::new_empty()).unwrap();
        let registry = builder.build();

        let response = registry
            .execute("actions/list", json!({}))
            .unwrap()
            .unwrap();

        assert_eq!(
            response,
            json!({
                "actions": [
                    {
                        "name": "actions/list",
                        "description": "Lists all registered actions"
                    },
                    {
                        "name": "info",
                        "description": "Retrieves application information"
                    }
                ]
            })
        );
    }
}
