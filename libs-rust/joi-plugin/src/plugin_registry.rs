use std::{
    any::{TypeId, type_name},
    collections::HashSet,
    marker::PhantomData,
    sync::Arc,
};

use joi_base::{JoiRwLock, JoiRwLockReadGuard, JoiString};
use joi_error::{JoiResult, joi_error};

use crate::{
    Plugin, PluginContext, extension_collection::ExtensionCollection,
    plugin_context::ExtensionCollections,
};

/// Registry of named plugins and their typed extensions.
#[derive(Clone, Default)]
pub struct PluginRegistry {
    inner: Arc<JoiRwLock<PluginRegistryInner>>,
}

#[derive(Default)]
struct PluginRegistryInner {
    plugin_names: HashSet<JoiString>,
    extension_points: ExtensionCollections,
}

/// A read-locked view of extensions registered for trait `T`.
pub struct Extensions<'a, T: ?Sized> {
    inner: JoiRwLockReadGuard<'a, PluginRegistryInner>,
    marker: PhantomData<fn() -> T>,
}

impl<T> Extensions<'_, T>
where
    T: ?Sized + Send + Sync + 'static,
{
    pub fn iter(&self) -> impl Iterator<Item = &T> {
        self.inner
            .extension_points
            .get(&TypeId::of::<T>())
            .and_then(|collection| collection.as_any().downcast_ref::<ExtensionCollection<T>>())
            .expect("extension collection was validated when the view was created")
            .iter()
    }
}

impl PluginRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Runs and atomically commits a plugin's registration callback.
    pub fn register(&self, plugin: Plugin) -> JoiResult<()> {
        let mut inner = self.inner.write();
        if inner.plugin_names.contains(&plugin.name) {
            return Err(joi_error!("plugin `{}` is already registered", plugin.name));
        }

        let mut context = PluginContext::new(&inner.extension_points);
        (plugin.callback)(&mut context)?;
        let (staged_points, staged_extensions) = context.into_staged();

        for (type_id, extensions) in staged_extensions {
            inner
                .extension_points
                .get_mut(&type_id)
                .ok_or_else(|| joi_error!("registered extension point disappeared"))?
                .append(extensions)?;
        }
        inner.extension_points.extend(staged_points);
        inner.plugin_names.insert(plugin.name);
        Ok(())
    }

    /// Returns a read-locked view of extensions for trait `T`.
    pub fn extensions<T>(&self) -> JoiResult<Extensions<'_, T>>
    where
        T: ?Sized + Send + Sync + 'static,
    {
        let inner = self.inner.read();
        inner
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
        Ok(Extensions {
            inner,
            marker: PhantomData,
        })
    }
}
