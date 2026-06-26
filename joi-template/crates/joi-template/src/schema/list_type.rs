use crate::schema::DataType;
use crate::source::FileSpan;

/// A homogeneous list type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ListType {
    /// The element type for every item in the list.
    pub element_type: Box<DataType>,
    /// The source location of this list definition, when known.
    pub span: Option<FileSpan>,
}

impl ListType {
    /// Creates a new list type from an element type.
    #[must_use]
    pub fn new(element_type: DataType) -> Self {
        Self {
            element_type: Box::new(element_type),
            span: None,
        }
    }

    /// Returns this list definition with source location information attached.
    #[must_use]
    pub fn with_span(mut self, span: FileSpan) -> Self {
        self.span = Some(span);
        self
    }
}
