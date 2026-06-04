use crate::schema::{ListType, PrimitiveType, StructType};

/// A type supported by a template schema.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DataType {
    Primitive(PrimitiveType),
    Struct(StructType),
    List(ListType),
}
