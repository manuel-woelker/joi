use joi_base::JoiString;

pub struct ModuleInfo {
    pub name: JoiString,
    pub description: JoiString,
    pub version: JoiString,
}

pub trait Module {
    fn info(&self) -> ModuleInfo;
}

fn _assert_dyn_compatible(_: &dyn Module) {}
