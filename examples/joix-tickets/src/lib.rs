use joi_plugin::{Plugin, plugin};
use joi_server::command_registry::CommandProvider;
use joi_server::data_store::{TableDescriptionProvider, TestDataProvider};

use crate::{
    projects_module::{ProjectTableDescriptionProvider, ProjectTestDataProvider},
    tickets_module::{TicketTableDescriptionProvider, TicketTestDataProvider},
};

mod projects_module;
mod ticket_creation;
mod ticket_test_data_command;
mod tickets_module;

use ticket_test_data_command::TicketTestDataCommandProvider;

/// Creates the ticket and project domain plugin.
pub fn tickets_plugin() -> Plugin {
    plugin("tickets", "Ticket management", |context| {
        context.register_extension::<dyn joi_server::mutation_contributor::MutationContributor>(
            "ticket-creation",
            "Assigns ticket keys and creation dates with private project counters",
            Box::new(ticket_creation::TicketCreation),
        )?;
        context.register_extension::<dyn joi_server::mutation_contributor::MutationContributor>(
            "ticket-project-history",
            "Stores ticket and project changes atomically with entity mutations",
            Box::new(joi_server::entity_history::HistoryContributor::new(vec![
                joi_server::data_store::TableName("tickets".into()),
                joi_server::data_store::TableName("projects".into()),
            ])),
        )?;
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
        )?;
        context.register_extension::<dyn CommandProvider>(
            "ticket-test-data-command",
            "Generates additional ticket data for development",
            Box::new(TicketTestDataCommandProvider),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use joi_plugin::PluginRegistryBuilder;
    use joi_server::{
        command_handler::{CommandHandler, CommandUser},
        data_store::{AttributeName, DataStore, DataStoreQuery, QueryCriterion, TableName, Values},
        generated::api::EntityHistoryRequest,
        mutation_contributor::{MutationContext, MutationContributor},
        storage::IndexedDataStore,
        user_session_command::{UserTableDescriptionProvider, UserTestDataProvider},
    };

    #[test]
    fn plugin_tracks_project_seeds_and_user_generated_tickets() {
        let mut builder = PluginRegistryBuilder::new();
        builder
            .register(plugin("base", "Test host", |context| {
                context.register_extension_point::<dyn MutationContributor>(
                    "mutations",
                    "Mutations",
                )?;
                context
                    .register_extension_point::<dyn TableDescriptionProvider>("tables", "Tables")?;
                context.register_extension_point::<dyn TestDataProvider>("seeds", "Seeds")?;
                context.register_extension_point::<dyn CommandProvider>("commands", "Commands")?;
                context.register_extension::<dyn TableDescriptionProvider>(
                    "users",
                    "Users",
                    Box::new(UserTableDescriptionProvider),
                )
            }))
            .unwrap();
        builder.register(tickets_plugin()).unwrap();
        let registry = builder.build();
        let schemas = registry
            .extensions::<dyn TableDescriptionProvider>()
            .unwrap()
            .map(TableDescriptionProvider::table_description)
            .collect::<Vec<_>>();
        let models = joi_server::model_info_command::ModelInfoCommand::new(registry.clone())
            .execute(
                &Default::default(),
                joi_server::generated::api::ModelInfoRequest {},
            )
            .unwrap()
            .models;
        for (name, template, icon) in [
            ("tickets", "${key}: ${title}", "ticket"),
            ("projects", "${name}", "folder-kanban"),
            ("users", "${name} (${username})", "users"),
        ] {
            let model = models.iter().find(|model| model.name == name).unwrap();
            let presentation = model.presentation.as_ref().unwrap();
            assert_eq!(presentation.label_template, template);
            assert_eq!(presentation.icon, icon);
            assert_eq!(presentation.fields.len(), model.attributes.len());
            assert!(
                presentation
                    .fields
                    .iter()
                    .any(|field| !field.validation.is_empty())
            );
        }
        assert_eq!(
            models
                .iter()
                .filter(|model| model.history)
                .map(|model| model.name.as_str())
                .collect::<Vec<_>>(),
            vec!["projects", "tickets"]
        );
        let mut store = IndexedDataStore::in_memory().unwrap();
        store.set_contributors(registry).unwrap();
        store.ensure_tables(schemas).unwrap();
        UserTestDataProvider.insert_test_data(&mut store).unwrap();
        ProjectTestDataProvider
            .insert_test_data(&mut store)
            .unwrap();
        let user = CommandUser {
            id: "jane".into(),
            username: "jane".into(),
        };
        tickets_module::generate_additional_tickets(
            &mut store,
            &MutationContext::for_user(Some(&user)),
            2,
        )
        .unwrap();
        for (table, actor, count) in [("projects", "system", 2), ("tickets", "jane", 2)] {
            let rows = store
                .query(DataStoreQuery {
                    table_name: TableName(table.into()),
                    criterion: QueryCriterion::MatchAny,
                    sorting: vec![],
                    max_results: 10,
                    attributes: vec![AttributeName("id".into())],
                })
                .unwrap();
            let Values::String(ids) = &rows.result_columns[0].values else {
                panic!("string ids")
            };
            assert_eq!(ids.len(), count);
            for id in ids {
                let page = store
                    .history(EntityHistoryRequest {
                        table: table.into(),
                        entity_id: id.to_string(),
                        cursor: None,
                        limit: None,
                    })
                    .unwrap();
                assert_eq!(page.entries.len(), 1);
                assert_eq!(page.entries[0].userid, actor);
            }
        }
        assert!(!store.history_enabled(&TableName("users".into())));
    }
}
mod model_metadata;
