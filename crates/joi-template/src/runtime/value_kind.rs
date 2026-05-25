use crate::model::PrimitiveType;

/// The runtime kind of a value as observed during template evaluation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValueKind {
    Primitive(PrimitiveType),
    Struct,
    List,
}
