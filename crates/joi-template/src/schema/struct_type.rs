use crate::schema::Field;
use crate::source::FileSpan;

/// A structured type with named fields.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StructType {
    /// The fields available on the struct.
    pub fields: Vec<Field>,
    /// The source location of this struct definition, when known.
    pub span: Option<FileSpan>,
}

impl StructType {
    /// Creates a new structured type from a list of fields.
    #[must_use]
    pub fn new(fields: Vec<Field>) -> Self {
        Self { fields, span: None }
    }

    /// Returns this struct definition with source location information attached.
    #[must_use]
    pub fn with_span(mut self, span: FileSpan) -> Self {
        self.span = Some(span);
        self
    }
}
