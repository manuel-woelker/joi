use std::{
    any::{TypeId, type_name},
    collections::{HashMap, HashSet},
};

use joi_base::JoiString;
use joi_error::{JoiResult, joi_error};

use crate::extension_collection::{ErasedExtensionCollection, ExtensionCollection};

pub(crate) type ExtensionCollections = HashMap<TypeId, Box<dyn ErasedExtensionCollection>>;

pub(crate) struct StagedExtensionPoint {
    pub(crate) type_id: TypeId,
    pub(crate) id: JoiString,
    pub(crate) description: JoiString,
}

pub(crate) struct StagedExtension {
    pub(crate) type_id: TypeId,
    pub(crate) id: JoiString,
    pub(crate) description: JoiString,
}

pub(crate) struct StagedRegistration {
    pub(crate) points: ExtensionCollections,
    pub(crate) extensions: ExtensionCollections,
    pub(crate) point_metadata: Vec<StagedExtensionPoint>,
    pub(crate) extension_metadata: Vec<StagedExtension>,
}

/// Registration interface exposed to a plugin callback.
pub struct PluginContext<'a> {
    committed_points: &'a ExtensionCollections,
    registered_point_ids: &'a HashSet<JoiString>,
    registered_extension_ids: &'a HashSet<JoiString>,
    staged_points: ExtensionCollections,
    staged_extensions: ExtensionCollections,
    staged_point_metadata: Vec<StagedExtensionPoint>,
    staged_extension_metadata: Vec<StagedExtension>,
}

impl<'a> PluginContext<'a> {
    pub(crate) fn new(
        committed_points: &'a ExtensionCollections,
        registered_point_ids: &'a HashSet<JoiString>,
        registered_extension_ids: &'a HashSet<JoiString>,
    ) -> Self {
        Self {
            committed_points,
            registered_point_ids,
            registered_extension_ids,
            staged_points: HashMap::new(),
            staged_extensions: HashMap::new(),
            staged_point_metadata: Vec::new(),
            staged_extension_metadata: Vec::new(),
        }
    }

    /// Registers the trait `T` as a new extension point with a stable ID.
    pub fn register_extension_point<T>(
        &mut self,
        id: impl Into<JoiString>,
        description: impl Into<JoiString>,
    ) -> JoiResult<()>
    where
        T: ?Sized + Send + Sync + 'static,
    {
        let id = id.into();
        let type_id = TypeId::of::<T>();
        if self.committed_points.contains_key(&type_id) || self.staged_points.contains_key(&type_id)
        {
            return Err(joi_error!(
                "extension point `{}` is already registered",
                type_name::<T>()
            ));
        }
        if self.registered_point_ids.contains(&id)
            || self
                .staged_point_metadata
                .iter()
                .any(|point| point.id == id)
        {
            return Err(joi_error!(
                "extension point ID `{id}` is already registered"
            ));
        }

        self.staged_points
            .insert(type_id, Box::new(ExtensionCollection::<T>::new()));
        self.staged_point_metadata.push(StagedExtensionPoint {
            type_id,
            id,
            description: description.into(),
        });
        Ok(())
    }

    /// Registers an implementation of extension-point trait `T` with a stable ID.
    pub fn register_extension<T>(
        &mut self,
        id: impl Into<JoiString>,
        description: impl Into<JoiString>,
        extension: Box<T>,
    ) -> JoiResult<()>
    where
        T: ?Sized + Send + Sync + 'static,
    {
        let id = id.into();
        if self.registered_extension_ids.contains(&id)
            || self
                .staged_extension_metadata
                .iter()
                .any(|extension| extension.id == id)
        {
            return Err(joi_error!("extension ID `{id}` is already registered"));
        }

        let type_id = TypeId::of::<T>();
        if let Some(collection) = self.staged_points.get_mut(&type_id) {
            push_extension(collection.as_mut(), extension)?;
        } else {
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
            push_extension(collection.as_mut(), extension)?;
        }
        self.staged_extension_metadata.push(StagedExtension {
            type_id,
            id,
            description: description.into(),
        });
        Ok(())
    }

    pub(crate) fn into_staged(self) -> StagedRegistration {
        StagedRegistration {
            points: self.staged_points,
            extensions: self.staged_extensions,
            point_metadata: self.staged_point_metadata,
            extension_metadata: self.staged_extension_metadata,
        }
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
