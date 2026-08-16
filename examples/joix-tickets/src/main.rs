use crate::module_registry::ModuleRegistry;
use crate::tickets_module::TicketsModule;

pub mod module;
pub mod module_registry;
pub mod tickets_module;

fn main() {
    println!("joix-tickets testbed");
    let mut module_registry = ModuleRegistry::new();
    module_registry.register::<TicketsModule>();
    dbg!(module_registry);
}
