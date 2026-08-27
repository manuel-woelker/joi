use std::{
    any::{TypeId, type_name},
    collections::HashSet,
    sync::Arc,
};

use joi_base::JoiString;
use joi_error::{JoiResult, joi_error};

use crate::{
    Plugin, PluginContext, PluginInfo, extension_collection::ExtensionCollection,
    plugin_context::ExtensionCollections,
};

/// Collects plugins before producing an immutable [`PluginRegistry`].
#[derive(Default)]
pub struct PluginRegistryBuilder {
    registered_plugin_names: HashSet<JoiString>,
    plugins: Vec<PluginInfo>,
    extension_points: ExtensionCollections,
}

impl PluginRegistryBuilder {
    pub fn new() -> Self {
        Self::default()
    }

    /// Runs and atomically commits a plugin's registration callback.
    pub fn register(&mut self, plugin: Plugin) -> JoiResult<()> {
        if self.registered_plugin_names.contains(&plugin.info.name) {
            return Err(joi_error!(
                "plugin `{}` is already registered",
                plugin.info.name
            ));
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
        self.registered_plugin_names
            .insert(plugin.info.name.clone());
        self.plugins.push(plugin.info);
        Ok(())
    }

    /// Produces an immutable, cheaply cloneable registry.
    pub fn build(self) -> PluginRegistry {
        PluginRegistry {
            inner: Arc::new(PluginRegistryInner {
                plugins: self.plugins,
                extension_points: self.extension_points,
            }),
        }
    }
}

/// Immutable registry of typed plugin extensions.
#[derive(Clone)]
pub struct PluginRegistry {
    inner: Arc<PluginRegistryInner>,
}

struct PluginRegistryInner {
    plugins: Vec<PluginInfo>,
    extension_points: ExtensionCollections,
}

impl PluginRegistry {
    /// Returns registered plugin metadata in registration order.
    pub fn plugins(&self) -> impl Iterator<Item = &PluginInfo> {
        self.inner.plugins.iter()
    }

    /// Returns extensions registered for trait `T` in registration order.
    pub fn extensions<T>(&self) -> JoiResult<impl Iterator<Item = &T>>
    where
        T: ?Sized + Send + Sync + 'static,
    {
        let collection = self
            .inner
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
