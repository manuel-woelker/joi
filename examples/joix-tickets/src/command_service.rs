use axum::{
    Json, Router,
    extract::{Path, State},
    http::{
        HeaderMap, HeaderValue, StatusCode,
        header::{COOKIE, SET_COOKIE},
    },
    response::{IntoResponse, Response},
    routing::post,
};
use joi_base::JoiString;
use serde::Serialize;

use crate::command_registry::CommandRegistry;
use crate::user_session_command::{
    LOGIN_COMMAND, LOGOUT_COMMAND, SESSION_COOKIE, USER_INFO_COMMAND,
};

/// Serves registered commands as JSON HTTP endpoints.
pub struct CommandService {
    router: Router,
}

impl CommandService {
    pub fn new(registry: CommandRegistry) -> Self {
        Self {
            router: Router::new()
                .route(
                    "/api/{*command_name}",
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
    State(registry): State<CommandRegistry>,
    Path(command_name): Path<JoiString>,
    headers: HeaderMap,
    Json(request): Json<serde_json::Value>,
) -> Result<Response, (StatusCode, Json<CommandResponseError>)> {
    execute_http(&registry, &command_name, request, &headers)
}

async fn execute_empty_object(
    State(registry): State<CommandRegistry>,
    Path(command_name): Path<JoiString>,
    headers: HeaderMap,
) -> Result<Response, (StatusCode, Json<CommandResponseError>)> {
    execute_http(&registry, &command_name, serde_json::json!({}), &headers)
}

#[derive(Debug, Serialize)]
struct CommandResponseError {
    error: JoiString,
}

fn command_error(
    command_name: &str,
    error: joi_error::JoiError,
) -> (StatusCode, Json<CommandResponseError>) {
    let status = if error
        .current_context()
        .downcast_ref::<serde_json::Error>()
        .is_some()
    {
        StatusCode::UNPROCESSABLE_ENTITY
    } else {
        StatusCode::INTERNAL_SERVER_ERROR
    };
    eprintln!("HTTP command `{command_name}` failed with {status}: {error:?}");
    (
        status,
        Json(CommandResponseError {
            error: error.to_string().into(),
        }),
    )
}

fn execute_registered(
    registry: &CommandRegistry,
    command_name: &str,
    request: serde_json::Value,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<CommandResponseError>)> {
    registry
        .execute(command_name, request)
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(CommandResponseError {
                    error: format!("command `{command_name}` is not registered").into(),
                }),
            )
        })?
        .map(Json)
        .map_err(|error| command_error(command_name, error))
}

fn execute_http(
    registry: &CommandRegistry,
    command_name: &str,
    mut request: serde_json::Value,
    headers: &HeaderMap,
) -> Result<Response, (StatusCode, Json<CommandResponseError>)> {
    if command_name == USER_INFO_COMMAND || command_name == LOGOUT_COMMAND {
        let session_id = session_cookie(headers).ok_or_else(unauthorized)?;
        request = serde_json::json!({ "session_id": session_id });
    }
    let mut response = execute_registered(registry, command_name, request)
        .map_err(|error| {
            if command_name == USER_INFO_COMMAND {
                unauthorized()
            } else {
                error
            }
        })?
        .0;
    let mut response_headers = HeaderMap::new();
    if command_name == LOGIN_COMMAND {
        let session_id = response
            .get("session_id")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| {
                command_error(
                    command_name,
                    joi_error::joi_error!("login returned no session ID"),
                )
            })?;
        let cookie = format!("{SESSION_COOKIE}={session_id}; Path=/; HttpOnly; SameSite=Strict");
        response_headers.insert(
            SET_COOKIE,
            HeaderValue::from_str(&cookie)
                .map_err(|error| command_error(command_name, joi_error::report(error)))?,
        );
        response
            .as_object_mut()
            .map(|object| object.remove("session_id"));
    } else if command_name == LOGOUT_COMMAND {
        response_headers.insert(
            SET_COOKIE,
            HeaderValue::from_static("joix_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"),
        );
    }
    Ok((response_headers, Json(response)).into_response())
}

fn session_cookie(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .filter_map(|cookie| cookie.trim().split_once('='))
        .find_map(|(name, value)| (name == SESSION_COOKIE).then_some(value))
}

fn unauthorized() -> (StatusCode, Json<CommandResponseError>) {
    (
        StatusCode::UNAUTHORIZED,
        Json(CommandResponseError {
            error: "login required".into(),
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
    use joi_plugin::{PluginRegistryBuilder, plugin};
    use serde::{Deserialize, Serialize};
    use serde_json::Value as JsonValue;
    use tower::ServiceExt;

    use crate::command::{Command, CommandDescriptor, CommandRequest};
    use crate::command_registry::CommandRegistryBuilder;
    use crate::info_command::{InfoCollector, InfoCommand, InfoProvider};

    use super::CommandService;

    #[derive(Deserialize)]
    struct GreetingRequest {
        name: JoiString,
    }

    #[derive(Debug, Deserialize, PartialEq, Serialize)]
    struct GreetingResponse {
        message: JoiString,
    }

    impl CommandRequest for GreetingRequest {
        type Response = GreetingResponse;
    }

    struct GreetingCommand;

    impl Command for GreetingCommand {
        type Request = GreetingRequest;

        fn descriptor() -> CommandDescriptor {
            CommandDescriptor {
                name: "greet".into(),
                description: "Greets a person".into(),
            }
        }

        fn execute(&self, request: Self::Request) -> joi_error::JoiResult<GreetingResponse> {
            Ok(GreetingResponse {
                message: format!("Hello, {}!", request.name).into(),
            })
        }
    }

    struct InvalidNameCommand;

    impl Command for InvalidNameCommand {
        type Request = GreetingRequest;

        fn descriptor() -> CommandDescriptor {
            CommandDescriptor {
                name: "invalid//name".into(),
                description: "Has an invalid route name".into(),
            }
        }

        fn execute(&self, request: Self::Request) -> joi_error::JoiResult<GreetingResponse> {
            GreetingCommand.execute(request)
        }
    }

    #[derive(Debug)]
    struct ExampleCommandError;

    impl fmt::Display for ExampleCommandError {
        fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str("command execution failed")
        }
    }

    impl Error for ExampleCommandError {}

    struct FailingCommand;

    impl Command for FailingCommand {
        type Request = GreetingRequest;

        fn descriptor() -> CommandDescriptor {
            CommandDescriptor {
                name: "fail".into(),
                description: "Always fails".into(),
            }
        }

        fn execute(&self, _request: Self::Request) -> joi_error::JoiResult<GreetingResponse> {
            Err(joi_error::report(ExampleCommandError))
        }
    }

    fn service_with<A>(command: A) -> CommandService
    where
        A: Command + Send + Sync + 'static,
    {
        let mut registry = CommandRegistryBuilder::new();
        registry.register(command).unwrap();
        CommandService::new(registry.build())
    }

    struct TestInfoProvider;

    impl InfoProvider for TestInfoProvider {
        fn collect_info(&self, collector: &mut InfoCollector) {
            collector.add_info(
                "application_name",
                JsonValue::String(env!("CARGO_PKG_NAME").into()),
            );
            collector.add_info(
                "version",
                JsonValue::String(env!("CARGO_PKG_VERSION").into()),
            );
        }
    }

    fn info_command() -> InfoCommand {
        let mut builder = PluginRegistryBuilder::new();
        builder
            .register(plugin("test-info", "Test information", |context| {
                context.register_extension_point::<dyn InfoProvider>(
                    "test-info-providers",
                    "Provides test information",
                )?;
                context.register_extension::<dyn InfoProvider>(
                    "test-info",
                    "Provides a test value",
                    Box::new(TestInfoProvider),
                )
            }))
            .unwrap();
        InfoCommand::new(builder.build())
    }

    #[tokio::test]
    async fn invokes_registered_commands_with_json() {
        let service = service_with(GreetingCommand);

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
    async fn invokes_the_info_command_with_an_empty_object_request() {
        let service = service_with(info_command());

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
    async fn invokes_get_commands_without_a_request_body() {
        let service = service_with(info_command());

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
    async fn invokes_commands_with_nested_names() {
        let service = CommandService::new(CommandRegistryBuilder::new().build());

        let response = service
            .into_router()
            .oneshot(
                Request::get("/api/commands/list")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&body).unwrap(),
            serde_json::json!({
                "commands": [{
                    "name": "commands/list",
                    "description": "Lists all registered commands"
                }]
            })
        );
    }

    #[tokio::test]
    async fn returns_json_when_an_empty_object_cannot_deserialize() {
        let service = service_with(GreetingCommand);

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
    async fn returns_command_errors_as_json() {
        let service = service_with(FailingCommand);

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
            serde_json::json!({ "error": "command execution failed" })
        );
    }

    #[test]
    fn rejects_duplicate_command_names() {
        let mut registry = CommandRegistryBuilder::new();
        registry.register(GreetingCommand).unwrap();

        let error = registry.register(GreetingCommand).unwrap_err();
        assert_eq!(error.to_string(), "command `greet` is already registered");
    }

    #[test]
    fn rejects_command_names_that_cannot_form_one_path_segment() {
        let mut registry = CommandRegistryBuilder::new();

        let error = registry.register(InvalidNameCommand).unwrap_err();
        assert_eq!(error.to_string(), "invalid command name `invalid//name`");
    }
}
