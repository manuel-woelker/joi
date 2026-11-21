use joi_architecture::{
    ArchitectureComponent, ArchitectureContext, ArchitectureError, ArchitectureGraph,
};
use joi_error::{JoiResult, joi_error, report};
use joi_plugin::PluginRegistry;
use serde::Deserialize;

use crate::{
    command::Command,
    command_handler::{CommandContext, CommandHandler},
    data_store::SharedDataStore,
    server::ServerConfig,
};

pub(crate) struct ArchitectureCommand {
    application_name: String,
    application_version: String,
    insert_test_data: bool,
    plugins: Plugins,
    data_store: SharedDataStore,
}

impl ArchitectureCommand {
    pub(crate) fn new(
        config: &ServerConfig,
        plugins: PluginRegistry,
        data_store: SharedDataStore,
    ) -> Self {
        Self {
            application_name: config.application_name.to_string(),
            application_version: config.application_version.to_string(),
            insert_test_data: config.insert_test_data,
            plugins: Plugins(plugins),
            data_store,
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ArchitectureRequest {}

impl Command for ArchitectureRequest {
    const NAME: &'static str = "architecture";
    const DESCRIPTION: &'static str = "Retrieves the running application's component graph";
    type Response = ArchitectureGraph;
}

impl CommandHandler for ArchitectureCommand {
    type Command = ArchitectureRequest;

    fn execute(
        &self,
        _context: &CommandContext,
        _request: ArchitectureRequest,
    ) -> JoiResult<ArchitectureGraph> {
        let store = self
            .data_store
            .lock()
            .map_err(|_| joi_error!("data store lock poisoned"))?;
        let root = ServerArchitecture {
            server: self,
            store: store.architecture_component(),
        };
        ArchitectureGraph::collect([&root as &dyn ArchitectureComponent]).map_err(report)
    }
}

struct ServerArchitecture<'a> {
    server: &'a ArchitectureCommand,
    store: Option<&'a dyn ArchitectureComponent>,
}

impl ArchitectureComponent for ServerArchitecture<'_> {
    fn describe<'a>(
        &'a self,
        context: &mut ArchitectureContext<'_, 'a>,
    ) -> Result<(), ArchitectureError> {
        context.component(
            "server",
            "JOI server",
            "Handles application commands.",
            |details| {
                details.config("application_name", self.server.application_name.as_str());
                details.config(
                    "application_version",
                    self.server.application_version.as_str(),
                );
                details.config("insert_test_data", self.server.insert_test_data);
                details.relate("uses", &self.server.plugins)?;
                if let Some(store) = self.store {
                    details.relate("uses", store)?;
                }
                Ok(())
            },
        )
    }
}

struct Plugins(PluginRegistry);

impl ArchitectureComponent for Plugins {
    fn describe<'a>(
        &'a self,
        context: &mut ArchitectureContext<'_, 'a>,
    ) -> Result<(), ArchitectureError> {
        context.component(
            "plugin-registry",
            "Plugin registry",
            "Tracks registered plugins and their extensions.",
            |details| {
                details.metric("plugins", self.0.plugins().count());
                details.metric("extension_points", self.0.extension_points().count());
                details.metric("extensions", self.0.extensions_info().count());
                Ok(())
            },
        )
    }
}
