use std::{collections::HashSet, error::Error, fmt};

use axum::{Router, routing::post};
use joi_base::JoiString;
use joi_error::{JoiResult, report};

use crate::{
    action::Action,
    action_service::{execute, execute_empty_object},
};

/// Collects typed actions and validates their HTTP route names.
#[derive(Debug, Default)]
pub struct ActionRegistry {
    action_names: HashSet<JoiString>,
    router: Router,
}

impl ActionRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Registers an action for JSON POST requests and empty-body GET requests.
    pub fn register<A>(&mut self) -> JoiResult<()>
    where
        A: Action + Send + Sync + 'static,
    {
        let action_name = A::descriptor().name;
        if !is_valid_action_name(&action_name) {
            return Err(report(ActionRegistrationError::InvalidName(action_name)));
        }
        if !self.action_names.insert(action_name.clone()) {
            return Err(report(ActionRegistrationError::DuplicateName(action_name)));
        }

        let path = format!("/api/{action_name}");
        let route = post(execute::<A>).get(execute_empty_object::<A>);
        self.router = std::mem::take(&mut self.router).route(&path, route);
        Ok(())
    }

    pub(crate) fn into_router(self) -> Router {
        self.router
    }
}

fn is_valid_action_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ActionRegistrationError {
    InvalidName(JoiString),
    DuplicateName(JoiString),
}

impl fmt::Display for ActionRegistrationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidName(name) => write!(formatter, "invalid action name `{name}`"),
            Self::DuplicateName(name) => write!(formatter, "action `{name}` is already registered"),
        }
    }
}

impl Error for ActionRegistrationError {}
