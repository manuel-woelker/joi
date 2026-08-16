use crate::module::{Module, ModuleInfo};

#[derive(Default)]
pub struct TicketsModule {}

impl Module for TicketsModule {
    fn info(&self) -> ModuleInfo {
        ModuleInfo {
            name: "tickets".into(),
            description: "Basic ticket module".into(),
            version: env!("CARGO_PKG_VERSION").into(),
        }
    }
}
