use joi_plugin::{Plugin, plugin};
use joi_server::data_store::{TableDescriptionProvider, TestDataProvider};

use crate::{
    projects_module::{ProjectTableDescriptionProvider, ProjectTestDataProvider},
    tickets_module::{TicketTableDescriptionProvider, TicketTestDataProvider},
};

mod projects_module;
mod tickets_module;

/// Creates the ticket and project domain plugin.
pub fn tickets_plugin() -> Plugin {
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
