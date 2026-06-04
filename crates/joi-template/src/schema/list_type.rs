use crate::schema::DataType;

/// A homogeneous list type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ListType {
    /// The element type for every item in the list.
    pub element_type: Box<DataType>,
}

impl ListType {
    /// Creates a new list type from an element type.
    #[must_use]
    pub fn new(element_type: DataType) -> Self {
        Self {
            element_type: Box::new(element_type),
        }
    }
}
