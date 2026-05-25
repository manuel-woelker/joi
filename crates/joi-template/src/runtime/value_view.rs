use crate::runtime::{DataError, ValueKind};

/// A borrowed view over a runtime value.
pub trait ValueView<'a>: Clone {
    type ListIter: Iterator<Item = Result<Self, DataError>> + 'a
    where
        Self: 'a;

    /// Returns the runtime kind of this value.
    fn kind(&self) -> ValueKind;

    /// Returns the value as a string slice if it is a string.
    fn as_str(&self) -> Result<&'a str, DataError>;

    /// Returns the value as a boolean if it is a boolean.
    fn as_bool(&self) -> Result<bool, DataError>;

    /// Returns the value as an integer if it is an integer.
    fn as_i64(&self) -> Result<i64, DataError>;

    /// Returns the value as a float if it is a float.
    fn as_f64(&self) -> Result<f64, DataError>;

    /// Returns a field value if this is a struct and the field exists.
    fn field(&self, name: &str) -> Result<Option<Self>, DataError>;

    /// Returns an iterator over the list elements if this is a list.
    fn elements(&self) -> Result<Self::ListIter, DataError>;
}
