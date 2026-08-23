use std::{
    any::{TypeId, type_name},
    collections::HashSet,
};

use joi_base::JoiString;
use joi_error::{JoiResult, joi_error};

use crate::{
    Plugin, PluginContext, extension_collection::ExtensionCollection,
    plugin_context::ExtensionCollections,
};

/// Registry of named plugins and their typed extensions.
#[derive(Default)]
pub struct PluginRegistry {
    plugin_names: HashSet<JoiString>,
    extension_points: ExtensionCollections,
}

impl PluginRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Runs and atomically commits a plugin's registration callback.
    pub fn register(&mut self, plugin: Plugin) -> JoiResult<()> {
        if self.plugin_names.contains(&plugin.name) {
            return Err(joi_error!("plugin `{}` is already registered", plugin.name));
        }

        let mut context = PluginContext::new(&self.extension_points);
        (plugin.callback)(&mut context)?;
        let (staged_points, staged_extensions) = context.into_staged();

        for (type_id, extensions) in staged_extensions {
            self.extension_points
                .get_mut(&type_id)
                .ok_or_else(|| joi_error!("registered extension point disappeared"))?
                .append(extensions)?;
        }
        self.extension_points.extend(staged_points);
        self.plugin_names.insert(plugin.name);
        Ok(())
    }

    /// Returns extensions registered for trait `T` in registration order.
    pub fn extensions<T>(&self) -> JoiResult<impl Iterator<Item = &T>>
    where
        T: ?Sized + Send + Sync + 'static,
    {
        let collection = self
            .extension_points
            .get(&TypeId::of::<T>())
            .ok_or_else(|| joi_error!("extension point `{}` is not registered", type_name::<T>()))?
            .as_any()
            .downcast_ref::<ExtensionCollection<T>>()
            .ok_or_else(|| {
                joi_error!(
                    "extension collection type mismatch for `{}`",
                    type_name::<T>()
                )
            })?;
        Ok(collection.iter())
    }
}
