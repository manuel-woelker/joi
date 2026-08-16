pub struct ModuleInfo {
    pub name: String,
    pub description: String,
    pub version: String,
}

pub trait Module {
    fn info(&self) -> ModuleInfo;
}

fn _assert_dyn_compatible(_: &dyn Module) {}
