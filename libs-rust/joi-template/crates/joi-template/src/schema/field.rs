use crate::schema::DataType;
use crate::source::FileSpan;

/// A named field in a structured type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Field {
    /// The field name as referenced from templates and input data.
    pub name: String,
    /// The type assigned to the field.
    pub field_type: DataType,
    /// The source location of this field definition, when known.
    pub span: Option<FileSpan>,
}

impl Field {
    /// Creates a new field definition.
    #[must_use]
    pub fn new(name: impl Into<String>, field_type: DataType) -> Self {
        Self {
            name: name.into(),
            field_type,
            span: None,
        }
    }

    /// Returns this field definition with source location information attached.
    #[must_use]
    pub fn with_span(mut self, span: FileSpan) -> Self {
        self.span = Some(span);
        self
    }
}
