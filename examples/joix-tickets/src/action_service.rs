use axum::{Json, Router, http::StatusCode};
use joi_base::JoiString;
use serde::Serialize;

use crate::action::{Action, ActionRequest};
use crate::action_registry::ActionRegistry;

/// Serves registered actions as JSON HTTP endpoints.
#[derive(Debug)]
pub struct ActionService {
    router: Router,
}

impl ActionService {
    pub fn new(registry: ActionRegistry) -> Self {
        Self {
            router: registry.into_router(),
        }
    }

    pub fn into_router(self) -> Router {
        self.router
    }
}

pub(crate) async fn execute<A>(
    Json(request): Json<A::Request>,
) -> Result<Json<<A::Request as ActionRequest>::Response>, (StatusCode, Json<ActionResponseError>)>
where
    A: Action,
{
    A::execute(request).map(Json).map_err(action_error)
}

pub(crate) async fn execute_empty_object<A>()
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
pub(crate) struct ActionResponseError {
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
    use crate::action_registry::{ActionRegistrationError, ActionRegistry};
    use crate::info_action::InfoAction;

    use super::ActionService;

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

    fn service_with<A>() -> ActionService
    where
        A: Action + Send + Sync + 'static,
    {
        let mut registry = ActionRegistry::new();
        registry.register::<A>().unwrap();
        ActionService::new(registry)
    }

    #[tokio::test]
    async fn invokes_registered_actions_with_json() {
        let service = service_with::<GreetingAction>();

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
        let service = service_with::<InfoAction>();

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
        let service = service_with::<InfoAction>();

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
        let service = service_with::<GreetingAction>();

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
        let service = service_with::<FailingAction>();

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
        let mut registry = ActionRegistry::new();
        registry.register::<GreetingAction>().unwrap();

        let error = registry.register::<GreetingAction>().unwrap_err();
        assert_eq!(
            error
                .current_context()
                .downcast_ref::<ActionRegistrationError>(),
            Some(&ActionRegistrationError::DuplicateName("greet".into()))
        );
    }

    #[test]
    fn rejects_action_names_that_cannot_form_one_path_segment() {
        let mut registry = ActionRegistry::new();

        let error = registry.register::<InvalidNameAction>().unwrap_err();
        assert_eq!(
            error
                .current_context()
                .downcast_ref::<ActionRegistrationError>(),
            Some(&ActionRegistrationError::InvalidName("invalid/name".into()))
        );
    }
}
