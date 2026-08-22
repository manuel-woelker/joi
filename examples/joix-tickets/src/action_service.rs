use std::{collections::HashSet, error::Error, fmt};

use axum::{
    Json, Router,
    http::StatusCode,
    routing::{MethodRouter, post},
};
use joi_base::JoiString;
use serde::Serialize;

use crate::action::{Action, ActionRequest};

/// Registers typed actions as JSON HTTP endpoints.
#[derive(Debug, Default)]
pub struct ActionService {
    action_names: HashSet<JoiString>,
    router: Router,
}

impl ActionService {
    pub fn new() -> Self {
        Self::default()
    }

    /// Registers an action for JSON POST requests and empty-body GET requests.
    pub fn register<A>(&mut self) -> Result<(), ActionRegistrationError>
    where
        A: Action + Send + Sync + 'static,
    {
        self.register_route(
            A::descriptor().name,
            post(execute::<A>).get(execute_empty_object::<A>),
        )
    }

    pub fn into_router(self) -> Router {
        self.router
    }

    fn register_route(
        &mut self,
        action_name: JoiString,
        route: MethodRouter,
    ) -> Result<(), ActionRegistrationError> {
        if !is_valid_action_name(&action_name) {
            return Err(ActionRegistrationError::InvalidName(action_name));
        }
        if !self.action_names.insert(action_name.clone()) {
            return Err(ActionRegistrationError::DuplicateName(action_name));
        }

        let path = format!("/api/{action_name}");
        self.router = std::mem::take(&mut self.router).route(&path, route);
        Ok(())
    }
}

async fn execute<A>(
    Json(request): Json<A::Request>,
) -> Result<Json<<A::Request as ActionRequest>::Response>, (StatusCode, Json<ActionResponseError>)>
where
    A: Action,
{
    A::execute(request).map(Json).map_err(action_error)
}

async fn execute_empty_object<A>()
-> Result<Json<<A::Request as ActionRequest>::Response>, (StatusCode, Json<ActionResponseError>)>
where
    A: Action,
{
    let request = serde_json::from_str("{}").map_err(|error| {
        (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(ActionResponseError {
                error: error.to_string().into(),
            }),
        )
    })?;
    A::execute(request).map(Json).map_err(action_error)
}

#[derive(Debug, Serialize)]
struct ActionResponseError {
    error: JoiString,
}

fn action_error(error: joi_error::JoiError) -> (StatusCode, Json<ActionResponseError>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ActionResponseError {
            error: error.to_string().into(),
        }),
    )
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

#[cfg(test)]
mod tests {
    use std::{error::Error, fmt};

    use axum::{
        body::{Body, to_bytes},
        http::{Request, StatusCode, header::CONTENT_TYPE},
    };
    use joi_base::JoiString;
    use serde::{Deserialize, Serialize};
    use tower::ServiceExt;

    use crate::action::{Action, ActionDescriptor, ActionRequest};
    use crate::info_action::InfoAction;

    use super::{ActionRegistrationError, ActionService};

    #[derive(Deserialize)]
    struct GreetingRequest {
        name: JoiString,
    }

    #[derive(Debug, Deserialize, PartialEq, Serialize)]
    struct GreetingResponse {
        message: JoiString,
    }

    impl ActionRequest for GreetingRequest {
        type Response = GreetingResponse;
    }

    struct GreetingAction;

    impl Action for GreetingAction {
        type Request = GreetingRequest;

        fn descriptor() -> ActionDescriptor {
            ActionDescriptor {
                name: "greet".into(),
                description: "Greets a person".into(),
            }
        }

        fn execute(request: Self::Request) -> joi_error::JoiResult<GreetingResponse> {
            Ok(GreetingResponse {
                message: format!("Hello, {}!", request.name).into(),
            })
        }
    }

    struct InvalidNameAction;

    impl Action for InvalidNameAction {
        type Request = GreetingRequest;

        fn descriptor() -> ActionDescriptor {
            ActionDescriptor {
                name: "invalid/name".into(),
                description: "Has an invalid route name".into(),
            }
        }

        fn execute(request: Self::Request) -> joi_error::JoiResult<GreetingResponse> {
            GreetingAction::execute(request)
        }
    }

    #[derive(Debug)]
    struct ExampleActionError;

    impl fmt::Display for ExampleActionError {
        fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str("action execution failed")
        }
    }

    impl Error for ExampleActionError {}

    struct FailingAction;

    impl Action for FailingAction {
        type Request = GreetingRequest;

        fn descriptor() -> ActionDescriptor {
            ActionDescriptor {
                name: "fail".into(),
                description: "Always fails".into(),
            }
        }

        fn execute(_request: Self::Request) -> joi_error::JoiResult<GreetingResponse> {
            Err(joi_error::report(ExampleActionError))
        }
    }

    #[tokio::test]
    async fn invokes_registered_actions_with_json() {
        let mut service = ActionService::new();
        service.register::<GreetingAction>().unwrap();

        let response = service
            .into_router()
            .oneshot(
                Request::post("/api/greet")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"name":"Ada"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[CONTENT_TYPE], "application/json");
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(
            serde_json::from_slice::<GreetingResponse>(&body).unwrap(),
            GreetingResponse {
                message: "Hello, Ada!".into(),
            }
        );
    }

    #[tokio::test]
    async fn invokes_the_info_action_with_an_empty_object_request() {
        let mut service = ActionService::new();
        service.register::<InfoAction>().unwrap();

        let response = service
            .into_router()
            .oneshot(
                Request::post("/api/info")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&body).unwrap(),
            serde_json::json!({
                "application_name": env!("CARGO_PKG_NAME"),
                "version": env!("CARGO_PKG_VERSION"),
            })
        );
    }

    #[tokio::test]
    async fn invokes_get_actions_without_a_request_body() {
        let mut service = ActionService::new();
        service.register::<InfoAction>().unwrap();

        let response = service
            .into_router()
            .oneshot(Request::get("/api/info").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[CONTENT_TYPE], "application/json");
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&body).unwrap(),
            serde_json::json!({
                "application_name": env!("CARGO_PKG_NAME"),
                "version": env!("CARGO_PKG_VERSION"),
            })
        );
    }

    #[tokio::test]
    async fn returns_json_when_an_empty_object_cannot_deserialize() {
        let mut service = ActionService::new();
        service.register::<GreetingAction>().unwrap();

        let response = service
            .into_router()
            .oneshot(Request::get("/api/greet").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(response.headers()[CONTENT_TYPE], "application/json");
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body = serde_json::from_slice::<serde_json::Value>(&body).unwrap();
        assert!(
            body["error"]
                .as_str()
                .unwrap()
                .contains("missing field `name`")
        );
    }

    #[tokio::test]
    async fn returns_action_errors_as_json() {
        let mut service = ActionService::new();
        service.register::<FailingAction>().unwrap();

        let response = service
            .into_router()
            .oneshot(
                Request::post("/api/fail")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"name":"Ada"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(response.headers()[CONTENT_TYPE], "application/json");
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&body).unwrap(),
            serde_json::json!({ "error": "action execution failed" })
        );
    }

    #[test]
    fn rejects_duplicate_action_names() {
        let mut service = ActionService::new();
        service.register::<GreetingAction>().unwrap();

        assert_eq!(
            service.register::<GreetingAction>(),
            Err(ActionRegistrationError::DuplicateName("greet".into()))
        );
    }

    #[test]
    fn rejects_action_names_that_cannot_form_one_path_segment() {
        let mut service = ActionService::new();

        assert_eq!(
            service.register::<InvalidNameAction>(),
            Err(ActionRegistrationError::InvalidName("invalid/name".into()))
        );
    }
}
