use std::collections::HashMap;

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
#[derive(Default)]
pub struct ActionRegistry {
    actions: HashMap<JoiString, RegisteredAction>,
}

impl ActionRegistry {
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

    pub fn descriptor(&self, name: &str) -> Option<&ActionDescriptor> {
        self.actions.get(name).map(|action| &action.descriptor)
    }

    pub fn descriptors(&self) -> impl Iterator<Item = &ActionDescriptor> {
        self.actions.values().map(|action| &action.descriptor)
    }

    pub fn execute(&self, name: &str, request: Value) -> Option<JoiResult<Value>> {
        self.actions
            .get(name)
            .map(|action| (action.execute)(request))
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
