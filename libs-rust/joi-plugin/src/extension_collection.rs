use std::any::{Any, type_name};

use joi_error::{JoiResult, joi_error};

pub(crate) trait ErasedExtensionCollection: Send + Sync {
    fn type_name(&self) -> &'static str;
    fn append(&mut self, other: Box<dyn ErasedExtensionCollection>) -> JoiResult<()>;
    fn as_any(&self) -> &dyn Any;
    fn as_any_mut(&mut self) -> &mut dyn Any;
    fn into_any(self: Box<Self>) -> Box<dyn Any + Send + Sync>;
}

pub(crate) struct ExtensionCollection<T: ?Sized> {
    extensions: Vec<Box<T>>,
}

impl<T: ?Sized> ExtensionCollection<T> {
    pub(crate) fn new() -> Self {
        Self {
            extensions: Vec::new(),
        }
    }

    pub(crate) fn push(&mut self, extension: Box<T>) {
        self.extensions.push(extension);
    }

    pub(crate) fn iter(&self) -> impl Iterator<Item = &T> {
        self.extensions.iter().map(Box::as_ref)
    }
}

impl<T: ?Sized + Send + Sync + 'static> ErasedExtensionCollection for ExtensionCollection<T> {
    fn type_name(&self) -> &'static str {
        type_name::<T>()
    }

    fn append(&mut self, other: Box<dyn ErasedExtensionCollection>) -> JoiResult<()> {
        let other_type_name = other.type_name();
        let other = other.into_any().downcast::<Self>().map_err(|_| {
            joi_error!(
                "extension collection type mismatch: expected `{}`, found `{other_type_name}`",
                type_name::<T>()
            )
        })?;
        self.extensions.extend(other.extensions);
        Ok(())
    }

    fn as_any(&self) -> &dyn Any {
        self
    }

    fn as_any_mut(&mut self) -> &mut dyn Any {
        self
    }

    fn into_any(self: Box<Self>) -> Box<dyn Any + Send + Sync> {
        self
    }
}
