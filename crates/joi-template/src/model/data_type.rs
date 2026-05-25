use crate::model::{ListType, PrimitiveType, StructType};

/// A type supported by the abstract model.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DataType {
    Primitive(PrimitiveType),
    Struct(StructType),
    List(ListType),
}
