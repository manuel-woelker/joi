use crate::module::Module;
use std::fmt::{Debug, Formatter};

#[derive(Default)]
pub struct ModuleRegistry {
    modules: Vec<Box<dyn Module>>,
}

impl ModuleRegistry {
    pub fn new() -> Self {
        Self {
            modules: Vec::new(),
        }
    }

    pub fn register<T: Module + Default + 'static>(&mut self) {
        self.register_module(T::default())
    }

    pub fn register_module(&mut self, module: impl Module + 'static) {
        self.modules.push(Box::new(module));
    }
}

impl Debug for ModuleRegistry {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let mut debug_struct = f.debug_struct("ModuleRegistry");
        for module in &self.modules {
            let info = module.info();
            debug_struct.field(&info.name, &info.version);
        }
        debug_struct.finish()
    }
}
