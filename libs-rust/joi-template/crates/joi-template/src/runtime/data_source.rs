use crate::runtime::{DataError, ValueView};

/// A source of template data.
pub trait DataSource {
    type Value<'a>: ValueView<'a>
    where
        Self: 'a;

    /// Returns the root runtime value for this data source.
    fn root(&self) -> Result<Self::Value<'_>, DataError>;
}
