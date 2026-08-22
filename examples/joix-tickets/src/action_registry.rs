use std::{collections::HashMap, sync::Arc};

use joi_base::JoiString;
use joi_error::{JoiResult, joi_bail, report};
use serde_json::Value;

use crate::action::{Action, ActionDescriptor, ActionRequest};

type ExecuteAction = fn(Value) -> JoiResult<Value>;

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

    pub fn register<A>(&mut self) -> JoiResult<()>
    where
        A: Action,
    {
        let descriptor = A::descriptor();
        if !is_valid_action_name(&descriptor.name) {
            joi_bail!("invalid action name `{}`", descriptor.name);
        }
        if self.actions.contains_key(&descriptor.name) {
            joi_bail!("action `{}` is already registered", descriptor.name);
        }

        self.actions.insert(
            descriptor.name.clone(),
            RegisteredAction {
                descriptor,
                execute: execute_action::<A>,
            },
        );
        Ok(())
    }

    pub fn build(self) -> ActionRegistry {
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
        let execute = self.inner.actions.get(name).map(|action| action.execute);
        execute.map(|execute| execute(request))
    }
}

fn execute_action<A>(request: Value) -> JoiResult<Value>
where
    A: Action,
{
    let request = serde_json::from_value::<A::Request>(request).map_err(report)?;
    let response = A::execute(request)?;
    serde_json::to_value::<<A::Request as ActionRequest>::Response>(response).map_err(report)
}

fn is_valid_action_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

#[cfg(test)]
mod tests {
    use crate::info_action::InfoAction;

    use super::ActionRegistryBuilder;

    #[test]
    fn builds_a_cloneable_immutable_registry() {
        let mut builder = ActionRegistryBuilder::new();
        builder.register::<InfoAction>().unwrap();

        let original = builder.build();
        let cloned = original.clone();

        assert!(original.descriptor("info").is_some());
        assert!(cloned.descriptor("info").is_some());
    }
}
