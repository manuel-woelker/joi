use std::{
    any::{TypeId, type_name},
    collections::{HashMap, HashSet},
    sync::Arc,
};

use joi_base::JoiString;
use joi_error::{JoiResult, joi_error};

use crate::{
    ExtensionInfo, ExtensionPointInfo, Plugin, PluginContext, PluginInfo,
    extension_collection::ExtensionCollection, plugin_context::ExtensionCollections,
};

/// Collects plugins before producing an immutable [`PluginRegistry`].
#[derive(Default)]
pub struct PluginRegistryBuilder {
    registered_plugin_names: HashSet<JoiString>,
    registered_extension_point_ids: HashSet<JoiString>,
    registered_extension_ids: HashSet<JoiString>,
    plugins: Vec<PluginInfo>,
    extension_point_info: Vec<ExtensionPointInfo>,
    extension_info: Vec<ExtensionInfo>,
    extension_point_ids: HashMap<TypeId, JoiString>,
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

        let mut context = PluginContext::new(
            &self.extension_points,
            &self.registered_extension_point_ids,
            &self.registered_extension_ids,
        );
        (plugin.callback)(&mut context)?;
        let staged = context.into_staged();

        for (type_id, extensions) in staged.extensions {
            self.extension_points
                .get_mut(&type_id)
                .ok_or_else(|| joi_error!("registered extension point disappeared"))?
                .append(extensions)?;
        }
        self.extension_points.extend(staged.points);

        let mut plugin_info = plugin.info;
        for point in staged.point_metadata {
            self.registered_extension_point_ids.insert(point.id.clone());
            self.extension_point_ids
                .insert(point.type_id, point.id.clone());
            plugin_info.extension_points.push(point.id.clone());
            self.extension_point_info.push(ExtensionPointInfo {
                id: point.id,
                description: point.description,
                extensions: Vec::new(),
            });
        }
        for extension in staged.extension_metadata {
            let extension_point_id = self
                .extension_point_ids
                .get(&extension.type_id)
                .ok_or_else(|| joi_error!("registered extension point metadata disappeared"))?
                .clone();
            self.registered_extension_ids.insert(extension.id.clone());
            plugin_info.extensions.push(extension.id.clone());
            self.extension_point_info
                .iter_mut()
                .find(|point| point.id == extension_point_id)
                .ok_or_else(|| joi_error!("registered extension point metadata disappeared"))?
                .extensions
                .push(extension.id.clone());
            self.extension_info.push(ExtensionInfo {
                id: extension.id,
                description: extension.description,
            });
        }
        self.registered_plugin_names
            .insert(plugin_info.name.clone());
        self.plugins.push(plugin_info);
        Ok(())
    }

    /// Produces an immutable, cheaply cloneable registry.
    pub fn build(self) -> PluginRegistry {
        PluginRegistry {
            inner: Arc::new(PluginRegistryInner {
                plugins: self.plugins,
                extension_points_info: self.extension_point_info,
                extensions_info: self.extension_info,
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
    extension_points_info: Vec<ExtensionPointInfo>,
    extensions_info: Vec<ExtensionInfo>,
    extension_points: ExtensionCollections,
}

impl PluginRegistry {
    /// Returns registered plugin metadata in registration order.
    pub fn plugins(&self) -> impl Iterator<Item = &PluginInfo> {
        self.inner.plugins.iter()
    }

    /// Returns extension-point metadata in registration order.
    pub fn extension_points(&self) -> impl Iterator<Item = &ExtensionPointInfo> {
        self.inner.extension_points_info.iter()
    }

    /// Returns extension metadata in registration order.
    pub fn extensions_info(&self) -> impl Iterator<Item = &ExtensionInfo> {
        self.inner.extensions_info.iter()
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
