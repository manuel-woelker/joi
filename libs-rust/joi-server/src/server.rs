use std::{
    path::PathBuf,
    process::ExitCode,
    sync::{Arc, Mutex},
};

use joi_base::JoiString;
use joi_error::{JoiResult, joi_error, report};
use joi_plugin::{Plugin, PluginRegistry, PluginRegistryBuilder, plugin};
use serde_json::Value as JsonValue;

use crate::{
    command_registry::{CommandProvider, CommandRegistry, CommandRegistryBuilder},
    command_service::CommandService,
    data_store::{DataStore, SharedDataStore, TableDescriptionProvider, TestDataProvider},
    generated::api::COMMAND_DESCRIPTORS,
    info_command::{InfoCollector, InfoCommand, InfoProvider},
    model_info_command::ModelInfoCommand,
    mutate_command::MutateCommand,
    plugins_command::PluginsCommand,
    query_command::QueryCommand,
    storage::IndexedDataStore,
    user_session_command::{
        LoginCommand, LogoutCommand, UserInfoCommand, UserSessionTableDescriptionProvider,
        UserTableDescriptionProvider, UserTestDataProvider,
    },
};

/// Configuration supplied by an application embedding the server runtime.
pub struct ServerConfig {
    /// Application name reported by the `info` command.
    pub application_name: JoiString,
    /// Application version reported by the `info` command.
    pub application_version: JoiString,
    /// Socket address used by the HTTP listener, such as `127.0.0.1:3000`.
    pub listen_address: JoiString,
    /// Path of the redb entity database opened or created at startup.
    pub entity_store_path: PathBuf,
    /// Path of the derived Tantivy search index.
    pub search_index_path: PathBuf,
    /// Whether registered test-data providers run during startup.
    pub insert_test_data: bool,
    /// Application plugins appended after the built-in server plugin.
    pub plugins: Vec<Plugin>,
}

/// Runs a configured server application using process command-line arguments.
pub fn application_main(config: ServerConfig) -> ExitCode {
    match run(config, std::env::args().skip(1)) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}

/// Runs one CLI command, or starts the HTTP server when no command is given.
pub fn run(config: ServerConfig, arguments: impl IntoIterator<Item = String>) -> JoiResult<()> {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(report)?
        .block_on(run_async(config, arguments))
}

async fn run_async(
    mut config: ServerConfig,
    arguments: impl IntoIterator<Item = String>,
) -> JoiResult<()> {
    let plugin_registry = create_plugin_registry(&mut config)?;
    let mut data_store =
        IndexedDataStore::open(&config.entity_store_path, &config.search_index_path)?;
    initialize_data_store(&plugin_registry, &mut data_store, config.insert_test_data)?;
    let data_store: SharedDataStore = Arc::new(Mutex::new(Box::new(data_store)));
    let registry = build_command_registry(plugin_registry, data_store)?;
    if let Some(command_name) = parse_command_name(arguments)? {
        print!("{}", execute_cli_command(&registry, &command_name)?);
        return Ok(());
    }

    run_service(registry, &config.listen_address).await
}

fn create_plugin_registry(config: &mut ServerConfig) -> JoiResult<PluginRegistry> {
    let application_name = config.application_name.clone();
    let application_version = config.application_version.clone();
    let mut builder = PluginRegistryBuilder::new();
    builder.register(plugin(
        "server",
        "JOI server infrastructure",
        move |context| {
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
            context.register_extension_point::<dyn CommandProvider>(
                "command-providers",
                "Registers domain command handlers",
            )?;
            context.register_extension::<dyn InfoProvider>(
                "package-info",
                "Provides package name and version",
                Box::new(PackageInfoProvider {
                    application_name,
                    application_version,
                }),
            )?;
            context.register_extension::<dyn InfoProvider>(
                "os-info",
                "Provides operating-system information",
                Box::new(OsInfoProvider),
            )?;
            context.register_extension::<dyn TableDescriptionProvider>(
                "users-table",
                "Defines the users table",
                Box::new(UserTableDescriptionProvider),
            )?;
            context.register_extension::<dyn TableDescriptionProvider>(
                "user-session-table",
                "Defines authenticated user sessions",
                Box::new(UserSessionTableDescriptionProvider),
            )?;
            context.register_extension::<dyn TestDataProvider>(
                "user-test-data",
                "Adds representative users for development",
                Box::new(UserTestDataProvider),
            )
        },
    ))?;
    for application_plugin in config.plugins.drain(..) {
        builder.register(application_plugin)?;
    }
    Ok(builder.build())
}

fn build_command_registry(
    plugin_registry: PluginRegistry,
    data_store: SharedDataStore,
) -> JoiResult<CommandRegistry> {
    let mut builder = CommandRegistryBuilder::new();
    builder.register(InfoCommand::new(plugin_registry.clone()))?;
    builder.register(ModelInfoCommand::new(plugin_registry.clone()))?;
    builder.register(PluginsCommand::new(plugin_registry.clone()))?;
    builder.register(QueryCommand::new(data_store.clone()))?;
    builder.register(MutateCommand::new(data_store.clone()))?;
    builder.register(LoginCommand::new(data_store.clone()))?;
    builder.register(LogoutCommand::new(data_store.clone()))?;
    builder.register(UserInfoCommand::new(data_store.clone()))?;
    for provider in plugin_registry.extensions::<dyn CommandProvider>()? {
        provider.register_commands(&mut builder, data_store.clone())?;
    }
    builder.require_handlers(COMMAND_DESCRIPTORS)?;
    Ok(builder.build())
}

fn initialize_data_store(
    plugin_registry: &PluginRegistry,
    data_store: &mut dyn DataStore,
    insert_test_data: bool,
) -> JoiResult<()> {
    let tables = plugin_registry
        .extensions::<dyn TableDescriptionProvider>()?
        .map(TableDescriptionProvider::table_description)
        .collect();
    data_store.ensure_tables(tables)?;
    if insert_test_data {
        for provider in plugin_registry.extensions::<dyn TestDataProvider>()? {
            provider.insert_test_data(data_store)?;
        }
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
        .execute(
            &crate::command_handler::CommandContext::default(),
            command_name,
            serde_json::json!({}),
        )
        .ok_or_else(|| joi_error!("command `{command_name}` is not registered"))??;
    yaml_serde::to_string(&response).map_err(report)
}

async fn run_service(registry: CommandRegistry, listen_address: &str) -> JoiResult<()> {
    let listener = tokio::net::TcpListener::bind(listen_address)
        .await
        .map_err(report)?;
    println!("HTTP commands available at http://{listen_address}/api/<command-name>");
    axum::serve(listener, CommandService::new(registry).into_router())
        .await
        .map_err(report)
}

struct PackageInfoProvider {
    application_name: JoiString,
    application_version: JoiString,
}

impl InfoProvider for PackageInfoProvider {
    fn collect_info(&self, collector: &mut InfoCollector) {
        collector.add_info(
            "application_name",
            JsonValue::String(self.application_name.to_string()),
        );
        collector.add_info(
            "version",
            JsonValue::String(self.application_version.to_string()),
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

#[cfg(test)]
mod tests {
    use std::{
        path::PathBuf,
        sync::{Arc, Mutex},
    };

    use axum::{
        body::{Body, to_bytes},
        http::{
            Request, StatusCode,
            header::{CONTENT_TYPE, COOKIE, SET_COOKIE},
        },
    };
    use serde_json::json;
    use tower::ServiceExt;

    use crate::{
        command_registry::CommandRegistry,
        command_service::CommandService,
        data_store::{DataStore, SharedDataStore},
        storage::IndexedDataStore,
    };

    use super::{
        ServerConfig, build_command_registry, create_plugin_registry, execute_cli_command,
        initialize_data_store, parse_command_name,
    };

    fn test_registry() -> CommandRegistry {
        let mut config = ServerConfig {
            application_name: "test-application".into(),
            application_version: "1.2.3".into(),
            listen_address: "127.0.0.1:0".into(),
            entity_store_path: PathBuf::new(),
            search_index_path: PathBuf::new(),
            insert_test_data: true,
            plugins: Vec::new(),
        };
        let plugins = create_plugin_registry(&mut config).unwrap();
        let mut store = IndexedDataStore::in_memory().unwrap();
        initialize_data_store(&plugins, &mut store, true).unwrap();
        let store: SharedDataStore = Arc::new(Mutex::new(Box::new(store) as Box<dyn DataStore>));
        build_command_registry(plugins, store).unwrap()
    }

    #[test]
    fn built_in_info_uses_application_configuration() {
        let response = test_registry()
            .execute(&Default::default(), "info", json!({}))
            .unwrap()
            .unwrap();

        assert_eq!(response["application_name"], "test-application");
        assert_eq!(response["version"], "1.2.3");
    }

    #[test]
    fn parses_at_most_one_cli_command() {
        assert_eq!(parse_command_name(Vec::new()).unwrap(), None);
        assert_eq!(
            parse_command_name(["info".to_owned()]).unwrap().as_deref(),
            Some("info")
        );
        assert!(parse_command_name(["info".to_owned(), "extra".to_owned()]).is_err());
    }

    #[test]
    fn executes_cli_commands_as_yaml() {
        let output = execute_cli_command(&test_registry(), "info").unwrap();

        assert!(output.contains("application_name: test-application"));
    }

    #[tokio::test]
    async fn login_cookie_authenticates_and_logout_revokes_a_session() {
        let registry = test_registry();
        let users = registry
            .execute(
                &Default::default(),
                "query",
                json!({
                    "table_name": "users",
                    "criterion": "match_any",
                    "results": [{
                        "type": "rows",
                        "sorting": [],
                        "max_results": 1,
                        "attributes": ["id"]
                    }]
                }),
            )
            .unwrap()
            .unwrap();
        let user_id = users["results"][0]["result_columns"][0]["values"]["values"][0]
            .as_str()
            .unwrap();
        let router = CommandService::new(registry).into_router();

        let unauthenticated = router
            .clone()
            .oneshot(Request::get("/api/user-info").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(unauthenticated.status(), StatusCode::UNAUTHORIZED);

        let login = router
            .clone()
            .oneshot(
                Request::post("/api/login")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({ "user_id": user_id }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(login.status(), StatusCode::OK);
        let cookie = login.headers()[SET_COOKIE].to_str().unwrap().to_owned();
        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.contains("SameSite=Strict"));
        let session_cookie = cookie.split(';').next().unwrap().to_owned();
        let login_body = to_bytes(login.into_body(), usize::MAX).await.unwrap();
        assert!(
            serde_json::from_slice::<serde_json::Value>(&login_body).unwrap()["session_id"]
                .is_null()
        );

        let user_info = router
            .clone()
            .oneshot(
                Request::get("/api/user-info")
                    .header(COOKIE, &session_cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(user_info.status(), StatusCode::OK);

        let logout = router
            .clone()
            .oneshot(
                Request::post("/api/logout")
                    .header(CONTENT_TYPE, "application/json")
                    .header(COOKIE, &session_cookie)
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(logout.status(), StatusCode::OK);
        assert!(
            logout.headers()[SET_COOKIE]
                .to_str()
                .unwrap()
                .contains("Max-Age=0")
        );

        let revoked = router
            .oneshot(
                Request::get("/api/user-info")
                    .header(COOKIE, session_cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(revoked.status(), StatusCode::UNAUTHORIZED);
    }
}
