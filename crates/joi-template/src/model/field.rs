use crate::model::DataType;

/// A named field in a structured type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Field {
    /// The field name as referenced from templates and input data.
    pub name: String,
    /// The type assigned to the field.
    pub field_type: DataType,
}

impl Field {
    /// Creates a new field definition.
    #[must_use]
    pub fn new(name: impl Into<String>, field_type: DataType) -> Self {
        Self {
            name: name.into(),
            field_type,
        }
    }
}
