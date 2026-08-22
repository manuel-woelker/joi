use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::post,
};
use joi_base::JoiString;
use serde::Serialize;

use crate::action_registry::ActionRegistry;

/// Serves registered actions as JSON HTTP endpoints.
pub struct ActionService {
    router: Router,
}

impl ActionService {
    pub fn new(registry: ActionRegistry) -> Self {
        Self {
            router: Router::new()
                .route(
                    "/api/{action_name}",
                    post(execute).get(execute_empty_object),
                )
                .with_state(registry),
        }
    }

    pub fn into_router(self) -> Router {
        self.router
    }
}

async fn execute(
    State(registry): State<ActionRegistry>,
    Path(action_name): Path<JoiString>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ActionResponseError>)> {
    execute_registered(&registry, &action_name, request)
}

async fn execute_empty_object(
    State(registry): State<ActionRegistry>,
    Path(action_name): Path<JoiString>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ActionResponseError>)> {
    execute_registered(&registry, &action_name, serde_json::json!({}))
}

#[derive(Debug, Serialize)]
struct ActionResponseError {
    error: JoiString,
}

fn action_error(error: joi_error::JoiError) -> (StatusCode, Json<ActionResponseError>) {
    let status = if error
        .current_context()
        .downcast_ref::<serde_json::Error>()
        .is_some()
    {
        StatusCode::UNPROCESSABLE_ENTITY
    } else {
        StatusCode::INTERNAL_SERVER_ERROR
    };
    (
        status,
        Json(ActionResponseError {
            error: error.to_string().into(),
        }),
    )
}

fn execute_registered(
    registry: &ActionRegistry,
    action_name: &str,
    request: serde_json::Value,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ActionResponseError>)> {
    registry
        .execute(action_name, request)
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ActionResponseError {
                    error: format!("action `{action_name}` is not registered").into(),
                }),
            )
        })?
        .map(Json)
        .map_err(action_error)
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
    use crate::action_registry::ActionRegistryBuilder;
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
        let mut registry = ActionRegistryBuilder::new();
        registry.register::<A>().unwrap();
        ActionService::new(registry.build())
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
        let mut registry = ActionRegistryBuilder::new();
        registry.register::<GreetingAction>().unwrap();

        let error = registry.register::<GreetingAction>().unwrap_err();
        assert_eq!(error.to_string(), "action `greet` is already registered");
    }

    #[test]
    fn rejects_action_names_that_cannot_form_one_path_segment() {
        let mut registry = ActionRegistryBuilder::new();

        let error = registry.register::<InvalidNameAction>().unwrap_err();
        assert_eq!(error.to_string(), "invalid action name `invalid/name`");
    }
}
