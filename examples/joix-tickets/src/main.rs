use crate::action_service::ActionService;
use crate::info_action::InfoAction;
use crate::module_registry::ModuleRegistry;
use crate::tickets_module::TicketsModule;

pub mod action;
pub mod action_service;
pub mod data_store;
pub mod info_action;
pub mod module;
pub mod module_registry;
pub mod tickets_module;
#[tokio::main]
async fn main() {
    println!("joix-tickets testbed");
    let mut module_registry = ModuleRegistry::new();
    module_registry.register::<TicketsModule>();
    dbg!(module_registry);

    let mut action_service = ActionService::new();
    action_service.register::<InfoAction>().unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000")
        .await
        .unwrap();
    println!("HTTP actions available at http://127.0.0.1:3000/api/<action-name>");
    axum::serve(listener, action_service.into_router())
        .await
        .unwrap();
}
