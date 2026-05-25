/// Primitive scalar types supported by the abstract model.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PrimitiveType {
    String,
    Integer,
    Float,
    Boolean,
}
