use crate::action::{Action, ActionDescriptor, ActionRequest};
use serde::{Deserialize, Serialize};

pub struct VersionAction;

#[derive(Debug, Serialize)]
pub struct VersionActionResponse {
    pub version: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VersionActionRequest {}

impl ActionRequest for VersionActionRequest {
    type Response = VersionActionResponse;
}

impl Action for VersionAction {
    type Request = VersionActionRequest;

    fn descriptor() -> ActionDescriptor {
        ActionDescriptor {
            name: "version".into(),
            description: "Retrieves version information".into(),
        }
    }

    fn execute(_request: Self::Request) -> <Self::Request as ActionRequest>::Response {
        VersionActionResponse {
            version: env!("CARGO_PKG_VERSION").into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::action::Action;

    use super::{VersionAction, VersionActionRequest};

    #[test]
    fn describes_the_version_action() {
        let descriptor = VersionAction::descriptor();

        assert_eq!(descriptor.name, "version");
        assert_eq!(descriptor.description, "Retrieves version information");
    }

    #[test]
    fn returns_the_package_version() {
        let response = VersionAction::execute(VersionActionRequest {});

        assert_eq!(response.version, env!("CARGO_PKG_VERSION"));
    }
}
