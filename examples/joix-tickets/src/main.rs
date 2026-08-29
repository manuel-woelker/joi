use std::{
    process::ExitCode,
    sync::{Arc, Mutex},
};

use joi_base::JoiString;
use joi_error::{JoiResult, joi_error, report};
use joi_plugin::{PluginRegistry, PluginRegistryBuilder, plugin};
use serde_json::Value as JsonValue;

use crate::command_registry::{CommandRegistry, CommandRegistryBuilder};
use crate::command_service::CommandService;
use crate::data_mutation_command::MutateCommand;
use crate::data_store::{DataStore, SharedDataStore, TableDescriptionProvider, TestDataProvider};
use crate::info_command::{InfoCollector, InfoCommand, InfoProvider};
use crate::module_registry::ModuleRegistry;
use crate::plugins_command::PluginsCommand;
use crate::sqlite_data_store::SqliteDataStore;
use crate::ticket_query_command::QueryCommand;
use crate::tickets_module::{
    TicketTableDescriptionProvider, TicketTestDataProvider, TicketsModule,
    UserTableDescriptionProvider, UserTestDataProvider,
};

const DATA_STORE_PATH: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/joix-tickets.sqlite3");

pub mod command;
pub mod command_registry;
pub mod command_service;
pub mod data_mutation_command;
pub mod data_store;
pub mod info_command;
pub mod module;
pub mod module_registry;
pub mod plugins_command;
pub mod sqlite_data_store;
pub mod ticket_query_command;
pub mod tickets_module;

struct PackageInfoProvider;

impl InfoProvider for PackageInfoProvider {
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

struct OsInfoProvider;

impl InfoProvider for OsInfoProvider {
    fn collect_info(&self, collector: &mut InfoCollector) {
        collector.add_info("os", JsonValue::String(std::env::consts::OS.into()));
        collector.add_info(
            "architecture",
            JsonValue::String(std::env::consts::ARCH.into()),
        );
        collector.add_info(
            "os_family",
            JsonValue::String(std::env::consts::FAMILY.into()),
        );
    }
}

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
    let plugin_registry = create_plugin_registry()?;
    let mut data_store = SqliteDataStore::open(DATA_STORE_PATH)?;
    initialize_data_store(&plugin_registry, &mut data_store)?;
    let data_store: SharedDataStore = Arc::new(Mutex::new(Box::new(data_store)));
    let registry = build_command_registry(plugin_registry.clone(), data_store)?;
    if let Some(command_name) = parse_command_name(arguments)? {
        print!("{}", execute_cli_command(&registry, &command_name)?);
        return Ok(());
    }

    run_service(registry).await
}

fn create_plugin_registry() -> JoiResult<PluginRegistry> {
    let mut builder = PluginRegistryBuilder::new();
    builder.register(plugin("infra", "Infrastructure services", |context| {
        context.register_extension_point::<dyn InfoProvider>(
            "info-providers",
            "Contributes application information",
        )?;
        context.register_extension_point::<dyn TableDescriptionProvider>(
            "table-descriptions",
            "Defines data-store tables",
        )?;
        context.register_extension_point::<dyn TestDataProvider>(
            "test-data-providers",
            "Populates tables with development data",
        )?;
        context.register_extension::<dyn InfoProvider>(
            "package-info",
            "Provides package name and version",
            Box::new(PackageInfoProvider),
        )?;
        context.register_extension::<dyn InfoProvider>(
            "os-info",
            "Provides operating-system information",
            Box::new(OsInfoProvider),
        )
    }))?;
    builder.register(plugin("tickets", "Ticket management", |context| {
        context.register_extension::<dyn TableDescriptionProvider>(
            "tickets-table",
            "Defines the tickets table",
            Box::new(TicketTableDescriptionProvider),
        )?;
        context.register_extension::<dyn TableDescriptionProvider>(
            "users-table",
            "Defines the users table",
            Box::new(UserTableDescriptionProvider),
        )?;
        context.register_extension::<dyn TestDataProvider>(
            "ticket-test-data",
            "Adds representative tickets for development",
            Box::new(TicketTestDataProvider),
        )?;
        context.register_extension::<dyn TestDataProvider>(
            "user-test-data",
            "Adds representative users for development",
            Box::new(UserTestDataProvider),
        )
    }))?;
    Ok(builder.build())
}

fn build_command_registry(
    plugin_registry: PluginRegistry,
    data_store: SharedDataStore,
) -> JoiResult<CommandRegistry> {
    let mut builder = CommandRegistryBuilder::new();
    builder.register(InfoCommand::new(plugin_registry.clone()))?;
    builder.register(PluginsCommand::new(plugin_registry))?;
    builder.register(QueryCommand::new(data_store.clone()))?;
    builder.register(MutateCommand::new(data_store))?;
    Ok(builder.build())
}

fn initialize_data_store(
    plugin_registry: &PluginRegistry,
    data_store: &mut dyn DataStore,
) -> JoiResult<()> {
    let tables = plugin_registry
        .extensions::<dyn TableDescriptionProvider>()?
        .map(TableDescriptionProvider::table_description)
        .collect();
    data_store.ensure_tables(tables)?;
    for provider in plugin_registry.extensions::<dyn TestDataProvider>()? {
        provider.insert_test_data(data_store)?;
    }
    Ok(())
}

fn parse_command_name(arguments: impl IntoIterator<Item = String>) -> JoiResult<Option<JoiString>> {
    let mut arguments = arguments.into_iter();
    let Some(command_name) = arguments.next() else {
        return Ok(None);
    };
    if let Some(unexpected) = arguments.next() {
        return Err(joi_error!(
            "unexpected command-line argument `{unexpected}`"
        ));
    }
    Ok(Some(command_name.into()))
}

fn execute_cli_command(registry: &CommandRegistry, command_name: &str) -> JoiResult<String> {
    let response = registry
        .execute(command_name, serde_json::json!({}))
        .ok_or_else(|| joi_error!("command `{command_name}` is not registered"))??;
    yaml_serde::to_string(&response).map_err(report)
}

async fn run_service(registry: CommandRegistry) -> JoiResult<()> {
    println!("joix-tickets testbed");
    let mut module_registry = ModuleRegistry::new();
    module_registry.register::<TicketsModule>();
    dbg!(module_registry);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000")
        .await
        .map_err(report)?;
    println!("HTTP commands available at http://127.0.0.1:3000/api/<command-name>");
    axum::serve(listener, CommandService::new(registry).into_router())
        .await
        .map_err(report)
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use axum::{
        body::{Body, to_bytes},
        http::{Request, StatusCode, header::CONTENT_TYPE},
    };
    use serde_json::json;
    use tower::ServiceExt;

    use crate::data_store::{
        AttributeName, DataStore, DataStoreQuery, QueryCriterion, SharedDataStore,
        TableDescriptionProvider, Values,
    };
    use crate::sqlite_data_store::SqliteDataStore;

    use super::{
        build_command_registry, create_plugin_registry, execute_cli_command, initialize_data_store,
        parse_command_name,
    };

    fn test_command_registry() -> crate::command_registry::CommandRegistry {
        let plugin_registry = create_plugin_registry().unwrap();
        let mut store = SqliteDataStore::in_memory().unwrap();
        initialize_data_store(&plugin_registry, &mut store).unwrap();
        let store: SharedDataStore = Arc::new(Mutex::new(Box::new(store)));
        build_command_registry(plugin_registry, store).unwrap()
    }

    #[test]
    fn info_command_collects_application_and_os_info() {
        let registry = test_command_registry();
        let response = registry.execute("info", json!({})).unwrap().unwrap();

        assert_eq!(response["application_name"], env!("CARGO_PKG_NAME"));
        assert_eq!(response["version"], env!("CARGO_PKG_VERSION"));
        assert_eq!(response["os"], std::env::consts::OS);
        assert_eq!(response["architecture"], std::env::consts::ARCH);
        assert_eq!(response["os_family"], std::env::consts::FAMILY);
    }

    #[test]
    fn plugins_command_lists_the_application_plugins() {
        let response = test_command_registry()
            .execute("plugins", json!({}))
            .unwrap()
            .unwrap();

        assert_eq!(
            response,
            json!({
                "plugins": [
                    {
                        "name": "infra",
                        "description": "Infrastructure services",
                        "extension_points": [
                            "info-providers",
                            "table-descriptions",
                            "test-data-providers"
                        ],
                        "extensions": ["package-info", "os-info"]
                    },
                    {
                        "name": "tickets",
                        "description": "Ticket management",
                        "extension_points": [],
                        "extensions": ["tickets-table", "users-table", "ticket-test-data", "user-test-data"]
                    }
                ],
                "extension_points": [
                    {
                        "id": "info-providers",
                        "description": "Contributes application information",
                        "extensions": ["package-info", "os-info"]
                    },
                    {
                        "id": "table-descriptions",
                        "description": "Defines data-store tables",
                        "extensions": ["tickets-table", "users-table"]
                    },
                    {
                        "id": "test-data-providers",
                        "description": "Populates tables with development data",
                        "extensions": ["ticket-test-data", "user-test-data"]
                    }
                ],
                "extensions": [
                    { "id": "package-info", "description": "Provides package name and version" },
                    { "id": "os-info", "description": "Provides operating-system information" },
                    { "id": "tickets-table", "description": "Defines the tickets table" },
                    { "id": "users-table", "description": "Defines the users table" },
                    { "id": "ticket-test-data", "description": "Adds representative tickets for development" },
                    { "id": "user-test-data", "description": "Adds representative users for development" }
                ]
            })
        );
    }

    #[test]
    fn query_command_returns_columnar_json() {
        let response = test_command_registry()
            .execute(
                "query",
                json!({
                    "table_name": "tickets",
                    "criterion": "match_any",
                    "max_results": 2,
                    "attributes": ["key", "title", "status"]
                }),
            )
            .unwrap()
            .unwrap();

        assert_eq!(response["number_of_hits"], 3);
        assert_eq!(response["result_columns"][0]["attribute"], "key");
        assert_eq!(
            response["result_columns"][0]["values"],
            json!({ "type": "string", "values": ["TEST-1", "TEST-2"] })
        );
    }

    #[test]
    fn mutate_command_inserts_and_updates_columnar_data() {
        let registry = test_command_registry();
        let response = registry
            .execute(
                "mutate",
                json!({
                    "steps": [
                        {
                            "insert": {
                                "table_name": "users",
                                "columns": [
                                    { "attribute": "id", "values": { "type": "string", "values": ["user-command-test"] } },
                                    { "attribute": "username", "values": { "type": "string", "values": ["command.test"] } },
                                    { "attribute": "name", "values": { "type": "string", "values": ["Command Test"] } }
                                ]
                            }
                        },
                        {
                            "update": {
                                "table_name": "users",
                                "ids": ["user-command-test"],
                                "columns": [
                                    { "attribute": "name", "values": { "type": "string", "values": ["Updated Command Test"] } }
                                ]
                            }
                        }
                    ]
                }),
            )
            .unwrap()
            .unwrap();
        assert_eq!(response, json!({}));

        let users = registry
            .execute(
                "query",
                json!({
                    "table_name": "users",
                    "criterion": { "equals": { "attribute": "id", "values": ["user-command-test"] } },
                    "max_results": 1,
                    "attributes": ["username", "name"]
                }),
            )
            .unwrap()
            .unwrap();
        assert_eq!(users["number_of_hits"], 1);
        assert_eq!(
            users["result_columns"][1]["values"]["values"][0],
            "Updated Command Test"
        );
    }

    #[tokio::test]
    async fn query_command_is_available_over_http() {
        let response = crate::command_service::CommandService::new(test_command_registry())
            .into_router()
            .oneshot(
                Request::post("/api/query")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        r#"{"table_name":"tickets","criterion":"match_any","max_results":100,"attributes":["key","title","description","status"]}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(body["number_of_hits"], 3);
        assert_eq!(body["result_columns"][1]["attribute"], "title");
    }

    #[tokio::test]
    async fn mutate_command_is_available_over_http() {
        let service =
            crate::command_service::CommandService::new(test_command_registry()).into_router();
        let response = service
            .oneshot(
                Request::post("/api/mutate")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        r#"{"steps":[{"insert":{"table_name":"users","columns":[{"attribute":"id","values":{"type":"string","values":["http-user"]}},{"attribute":"username","values":{"type":"string","values":["http.user"]}},{"attribute":"name","values":{"type":"string","values":["HTTP User"]}}]}}]}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&body).unwrap(),
            json!({})
        );
    }

    #[test]
    fn ticket_plugin_contributes_its_table_description() {
        let registry = create_plugin_registry().unwrap();
        let tables = registry
            .extensions::<dyn TableDescriptionProvider>()
            .unwrap()
            .map(TableDescriptionProvider::table_description)
            .collect::<Vec<_>>();

        assert_eq!(tables.len(), 2);
        assert_eq!(
            tables
                .iter()
                .map(|table| table.name.0.as_str())
                .collect::<Vec<_>>(),
            ["tickets", "users"]
        );
    }

    #[test]
    fn plugin_extensions_initialize_ticket_test_data() {
        let registry = create_plugin_registry().unwrap();
        let mut store = SqliteDataStore::in_memory().unwrap();

        initialize_data_store(&registry, &mut store).unwrap();

        let result = store
            .query(DataStoreQuery {
                table_name: crate::data_store::TableName("tickets".into()),
                criterion: QueryCriterion::MatchAny,
                max_results: 10,
                attributes: vec![AttributeName("title".into())],
            })
            .unwrap();
        assert_eq!(result.number_of_hits, 3);
        assert!(matches!(
            &result.result_columns[0].values,
            Values::String(values) if values[0] == "Fix navigation bug"
        ));
    }

    #[test]
    fn parses_server_and_command_modes() {
        assert_eq!(parse_command_name(Vec::new()).unwrap(), None);
        assert_eq!(
            parse_command_name(vec!["info".to_owned()])
                .unwrap()
                .as_deref(),
            Some("info")
        );
    }

    #[test]
    fn rejects_extra_command_line_arguments() {
        let error = parse_command_name(vec!["info".to_owned(), "extra".to_owned()]).unwrap_err();

        assert_eq!(
            error.to_string(),
            "unexpected command-line argument `extra`"
        );
    }

    #[test]
    fn executes_commands_as_yaml() {
        let registry = test_command_registry();
        let output = execute_cli_command(&registry, "info").unwrap();

        assert_eq!(
            yaml_serde::from_str::<serde_json::Value>(&output).unwrap(),
            json!({
                "application_name": env!("CARGO_PKG_NAME"),
                "version": env!("CARGO_PKG_VERSION"),
                "os": std::env::consts::OS,
                "architecture": std::env::consts::ARCH,
                "os_family": std::env::consts::FAMILY,
            })
        );
    }

    #[test]
    fn rejects_unknown_cli_commands() {
        let registry = test_command_registry();
        let error = execute_cli_command(&registry, "missing").unwrap_err();

        assert_eq!(error.to_string(), "command `missing` is not registered");
    }
}
