use joi_base::JoiString;
use joi_error::JoiResult;

use crate::PluginContext;

type RegistrationCallback =
    Box<dyn FnOnce(&mut PluginContext<'_>) -> JoiResult<()> + Send + 'static>;

/// A named, one-shot plugin registration callback.
pub struct Plugin {
    pub(crate) name: JoiString,
    pub(crate) callback: RegistrationCallback,
}

/// Creates a plugin that registers its extension points and extensions through
/// the supplied context.
pub fn plugin(
    name: impl Into<JoiString>,
    callback: impl FnOnce(&mut PluginContext<'_>) -> JoiResult<()> + Send + 'static,
) -> Plugin {
    Plugin {
        name: name.into(),
        callback: Box::new(callback),
    }
}
