use std::{
    any::{TypeId, type_name},
    collections::HashMap,
};

use joi_error::{JoiResult, joi_error};

use crate::extension_collection::{ErasedExtensionCollection, ExtensionCollection};

pub(crate) type ExtensionCollections = HashMap<TypeId, Box<dyn ErasedExtensionCollection>>;

/// Registration interface exposed to a plugin callback.
pub struct PluginContext<'a> {
    committed_points: &'a ExtensionCollections,
    staged_points: ExtensionCollections,
    staged_extensions: ExtensionCollections,
}

impl<'a> PluginContext<'a> {
    pub(crate) fn new(committed_points: &'a ExtensionCollections) -> Self {
        Self {
            committed_points,
            staged_points: HashMap::new(),
            staged_extensions: HashMap::new(),
        }
    }

    /// Registers the trait `T` as a new extension point.
    pub fn register_extension_point<T>(&mut self) -> JoiResult<()>
    where
        T: ?Sized + Send + Sync + 'static,
    {
        let type_id = TypeId::of::<T>();
        if self.committed_points.contains_key(&type_id) || self.staged_points.contains_key(&type_id)
        {
            return Err(joi_error!(
                "extension point `{}` is already registered",
                type_name::<T>()
            ));
        }

        self.staged_points
            .insert(type_id, Box::new(ExtensionCollection::<T>::new()));
        Ok(())
    }

    /// Registers an implementation of extension-point trait `T`.
    pub fn register_extension<T>(&mut self, extension: Box<T>) -> JoiResult<()>
    where
        T: ?Sized + Send + Sync + 'static,
    {
        let type_id = TypeId::of::<T>();
        if let Some(collection) = self.staged_points.get_mut(&type_id) {
            return push_extension(collection.as_mut(), extension);
        }

        if !self.committed_points.contains_key(&type_id) {
            return Err(joi_error!(
                "extension point `{}` is not registered",
                type_name::<T>()
            ));
        }

        let collection = self
            .staged_extensions
            .entry(type_id)
            .or_insert_with(|| Box::new(ExtensionCollection::<T>::new()));
        push_extension(collection.as_mut(), extension)
    }

    pub(crate) fn into_staged(self) -> (ExtensionCollections, ExtensionCollections) {
        (self.staged_points, self.staged_extensions)
    }
}

fn push_extension<T>(
    collection: &mut dyn ErasedExtensionCollection,
    extension: Box<T>,
) -> JoiResult<()>
where
    T: ?Sized + Send + Sync + 'static,
{
    collection
        .as_any_mut()
        .downcast_mut::<ExtensionCollection<T>>()
        .ok_or_else(|| {
            joi_error!(
                "extension collection type mismatch for `{}`",
                type_name::<T>()
            )
        })?
        .push(extension);
    Ok(())
}
