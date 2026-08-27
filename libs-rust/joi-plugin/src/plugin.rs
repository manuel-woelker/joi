use joi_base::JoiString;
use joi_error::JoiResult;

use crate::PluginContext;

type RegistrationCallback =
    Box<dyn FnOnce(&mut PluginContext<'_>) -> JoiResult<()> + Send + 'static>;

/// A named, one-shot plugin registration callback.
pub struct Plugin {
    pub(crate) info: PluginInfo,
    pub(crate) callback: RegistrationCallback,
}

/// Human-readable metadata for a registered plugin.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PluginInfo {
    pub name: JoiString,
    pub description: JoiString,
}

/// Creates a plugin that registers its extension points and extensions through
/// the supplied context.
pub fn plugin(
    name: impl Into<JoiString>,
    description: impl Into<JoiString>,
    callback: impl FnOnce(&mut PluginContext<'_>) -> JoiResult<()> + Send + 'static,
) -> Plugin {
    Plugin {
        info: PluginInfo {
            name: name.into(),
            description: description.into(),
        },
        callback: Box::new(callback),
    }
}
