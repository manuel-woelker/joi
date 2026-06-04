/// Primitive scalar types supported by a template schema.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PrimitiveType {
    String,
    Integer,
    Float,
    Boolean,
}
