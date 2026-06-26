use crate::schema::{ListType, PrimitiveType, StructType};
use crate::source::FileSpan;

/// A type supported by a template schema.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DataType {
    /// The kind of type this schema definition represents.
    pub kind: DataTypeKind,
    /// The source location of this schema definition, when known.
    pub span: Option<FileSpan>,
}

impl DataType {
    /// Creates a primitive schema definition.
    #[must_use]
    pub fn primitive(primitive_type: PrimitiveType) -> Self {
        Self::new(DataTypeKind::Primitive(primitive_type))
    }

    /// Creates a structured schema definition.
    #[must_use]
    pub fn struct_(struct_type: StructType) -> Self {
        Self::new(DataTypeKind::Struct(struct_type))
    }

    /// Creates a list schema definition.
    #[must_use]
    pub fn list(list_type: ListType) -> Self {
        Self::new(DataTypeKind::List(list_type))
    }

    /// Creates a schema definition from a kind.
    #[must_use]
    pub fn new(kind: DataTypeKind) -> Self {
        Self { kind, span: None }
    }

    /// Returns this schema definition with source location information attached.
    #[must_use]
    pub fn with_span(mut self, span: FileSpan) -> Self {
        self.span = Some(span);
        self
    }
}

/// The structural shape represented by a schema definition.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DataTypeKind {
    Primitive(PrimitiveType),
    Struct(StructType),
    List(ListType),
}

#[cfg(test)]
mod tests {
    use crate::schema::{DataType, DataTypeKind, Field, ListType, PrimitiveType, StructType};
    use crate::source::FileSpan;

    #[test]
    fn schema_definitions_can_carry_file_spans() {
        let field_span = FileSpan::new("schema.json", 24..48);
        let type_span = FileSpan::new("schema.json", 32..48);
        let struct_span = FileSpan::new("schema.json", 0..64);

        let field = Field::new(
            "name",
            DataType::primitive(PrimitiveType::String).with_span(type_span.clone()),
        )
        .with_span(field_span.clone());
        let schema = DataType::struct_(StructType::new(vec![field]).with_span(struct_span.clone()))
            .with_span(struct_span.clone());

        assert_eq!(schema.span, Some(struct_span.clone()));

        let DataTypeKind::Struct(root) = schema.kind else {
            panic!("expected struct schema");
        };

        assert_eq!(root.span, Some(struct_span));
        assert_eq!(root.fields[0].span, Some(field_span));
        assert_eq!(root.fields[0].field_type.span, Some(type_span));
    }

    #[test]
    fn list_definitions_can_carry_file_spans() {
        let span = FileSpan::new("schema.json", 8..32);
        let schema = DataType::list(
            ListType::new(DataType::primitive(PrimitiveType::String)).with_span(span.clone()),
        )
        .with_span(span.clone());

        assert_eq!(schema.span, Some(span.clone()));

        let DataTypeKind::List(list) = schema.kind else {
            panic!("expected list schema");
        };

        assert_eq!(list.span, Some(span));
    }
}
