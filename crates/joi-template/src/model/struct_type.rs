use crate::model::Field;

/// A structured type with named fields.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StructType {
    /// The fields available on the struct.
    pub fields: Vec<Field>,
}

impl StructType {
    /// Creates a new structured type from a list of fields.
    #[must_use]
    pub fn new(fields: Vec<Field>) -> Self {
        Self { fields }
    }
}
