use crate::action::{Action, ActionDescriptor, ActionRequest};
use joi_error::JoiResult;
use serde::{Deserialize, Serialize};

pub struct InfoAction;

#[derive(Debug, Serialize)]
pub struct InfoActionResponse {
    pub application_name: String,
    pub version: String,
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

    fn execute(_request: Self::Request) -> JoiResult<InfoActionResponse> {
        Ok(InfoActionResponse {
            application_name: env!("CARGO_PKG_NAME").into(),
            version: env!("CARGO_PKG_VERSION").into(),
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
    fn returns_application_information() {
        let response = InfoAction::execute(InfoActionRequest {}).unwrap();

        assert_eq!(response.application_name, env!("CARGO_PKG_NAME"));
        assert_eq!(response.version, env!("CARGO_PKG_VERSION"));
    }
}
