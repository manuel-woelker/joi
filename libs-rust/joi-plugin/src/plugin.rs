use joi_base::JoiString;
use joi_error::JoiResult;
use std::panic::Location;

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
    pub location: RegistrationLocation,
    pub extension_points: Vec<JoiString>,
    pub extensions: Vec<JoiString>,
}

/// Metadata for a registered extension point.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExtensionPointInfo {
    pub id: JoiString,
    pub description: JoiString,
    pub location: RegistrationLocation,
    pub extensions: Vec<JoiString>,
}

/// Metadata for a registered extension.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExtensionInfo {
    pub id: JoiString,
    pub description: JoiString,
    pub location: RegistrationLocation,
}

/// Source location at which a plugin item was registered.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegistrationLocation {
    pub file: JoiString,
    pub line: u32,
}

impl RegistrationLocation {
    #[track_caller]
    pub(crate) fn caller() -> Self {
        let caller = Location::caller();
        Self {
            file: caller.file().into(),
            line: caller.line(),
        }
    }
}

/// Creates a plugin that registers its extension points and extensions through
/// the supplied context.
#[track_caller]
pub fn plugin(
    name: impl Into<JoiString>,
    description: impl Into<JoiString>,
    callback: impl FnOnce(&mut PluginContext<'_>) -> JoiResult<()> + Send + 'static,
) -> Plugin {
    Plugin {
        info: PluginInfo {
            name: name.into(),
            description: description.into(),
            location: RegistrationLocation::caller(),
            extension_points: Vec::new(),
            extensions: Vec::new(),
        },
        callback: Box::new(callback),
    }
}
