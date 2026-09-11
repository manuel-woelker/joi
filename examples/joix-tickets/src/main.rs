use std::{path::PathBuf, process::ExitCode};

use joi_plugin::{Plugin, plugin};
use joi_server::{
    ServerConfig,
    data_store::{TableDescriptionProvider, TestDataProvider},
};

use crate::{
    projects_module::{ProjectTableDescriptionProvider, ProjectTestDataProvider},
    tickets_module::{TicketTableDescriptionProvider, TicketTestDataProvider},
};

mod projects_module;
mod tickets_module;

const DATA_STORE_PATH: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/joix-tickets.sqlite3");

fn main() -> ExitCode {
    joi_server::application_main(ServerConfig {
        application_name: env!("CARGO_PKG_NAME").into(),
        application_version: env!("CARGO_PKG_VERSION").into(),
        listen_address: "127.0.0.1:3000".into(),
        data_store_path: PathBuf::from(DATA_STORE_PATH),
        insert_test_data: true,
        plugins: vec![tickets_plugin()],
    })
}

fn tickets_plugin() -> Plugin {
    plugin("tickets", "Ticket management", |context| {
        context.register_extension::<dyn TableDescriptionProvider>(
            "projects-table",
            "Defines the projects table",
            Box::new(ProjectTableDescriptionProvider),
        )?;
        context.register_extension::<dyn TableDescriptionProvider>(
            "tickets-table",
            "Defines the tickets table",
            Box::new(TicketTableDescriptionProvider),
        )?;
        context.register_extension::<dyn TestDataProvider>(
            "project-test-data",
            "Adds the default Test and Demo projects",
            Box::new(ProjectTestDataProvider),
        )?;
        context.register_extension::<dyn TestDataProvider>(
            "ticket-test-data",
            "Adds representative tickets for development",
            Box::new(TicketTestDataProvider),
        )
    })
}
