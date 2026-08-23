use std::process::ExitCode;

use joi_base::JoiString;
use joi_error::{JoiResult, joi_error, report};

use crate::action_registry::{ActionRegistry, ActionRegistryBuilder};
use crate::action_service::ActionService;
use crate::info_action::InfoAction;
use crate::module_registry::ModuleRegistry;
use crate::tickets_module::TicketsModule;

pub mod action;
pub mod action_registry;
pub mod action_service;
pub mod data_store;
pub mod info_action;
pub mod module;
pub mod module_registry;
pub mod sqlite_data_store;
pub mod tickets_module;

#[tokio::main]
async fn main() -> ExitCode {
    match run(std::env::args().skip(1)).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}

async fn run(arguments: impl IntoIterator<Item = String>) -> JoiResult<()> {
    let registry = build_action_registry()?;
    if let Some(action_name) = parse_action_name(arguments)? {
        print!("{}", execute_cli_action(&registry, &action_name)?);
        return Ok(());
    }

    run_service(registry).await
}

fn build_action_registry() -> JoiResult<ActionRegistry> {
    let mut builder = ActionRegistryBuilder::new();
    builder.register::<InfoAction>()?;
    Ok(builder.build())
}

fn parse_action_name(arguments: impl IntoIterator<Item = String>) -> JoiResult<Option<JoiString>> {
    let mut arguments = arguments.into_iter();
    let Some(action_name) = arguments.next() else {
        return Ok(None);
    };
    if let Some(unexpected) = arguments.next() {
        return Err(joi_error!(
            "unexpected command-line argument `{unexpected}`"
        ));
    }
    Ok(Some(action_name.into()))
}

fn execute_cli_action(registry: &ActionRegistry, action_name: &str) -> JoiResult<String> {
    let response = registry
        .execute(action_name, serde_json::json!({}))
        .ok_or_else(|| joi_error!("action `{action_name}` is not registered"))??;
    yaml_serde::to_string(&response).map_err(report)
}

async fn run_service(registry: ActionRegistry) -> JoiResult<()> {
    println!("joix-tickets testbed");
    let mut module_registry = ModuleRegistry::new();
    module_registry.register::<TicketsModule>();
    dbg!(module_registry);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000")
        .await
        .map_err(report)?;
    println!("HTTP actions available at http://127.0.0.1:3000/api/<action-name>");
    axum::serve(listener, ActionService::new(registry).into_router())
        .await
        .map_err(report)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{build_action_registry, execute_cli_action, parse_action_name};

    #[test]
    fn parses_server_and_action_modes() {
        assert_eq!(parse_action_name(Vec::new()).unwrap(), None);
        assert_eq!(
            parse_action_name(vec!["info".to_owned()])
                .unwrap()
                .as_deref(),
            Some("info")
        );
    }

    #[test]
    fn rejects_extra_command_line_arguments() {
        let error = parse_action_name(vec!["info".to_owned(), "extra".to_owned()]).unwrap_err();

        assert_eq!(
            error.to_string(),
            "unexpected command-line argument `extra`"
        );
    }

    #[test]
    fn executes_actions_as_yaml() {
        let output = execute_cli_action(&build_action_registry().unwrap(), "info").unwrap();

        assert_eq!(
            yaml_serde::from_str::<serde_json::Value>(&output).unwrap(),
            json!({
                "application_name": env!("CARGO_PKG_NAME"),
                "version": env!("CARGO_PKG_VERSION"),
            })
        );
    }

    #[test]
    fn rejects_unknown_cli_actions() {
        let error = execute_cli_action(&build_action_registry().unwrap(), "missing").unwrap_err();

        assert_eq!(error.to_string(), "action `missing` is not registered");
    }
}
