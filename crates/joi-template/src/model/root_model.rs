use crate::model::DataType;

/// The root model used to validate templates and input data.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Model {
    /// The root type exposed to a template.
    pub root_type: DataType,
}

impl Model {
    /// Creates a new model from a root type.
    #[must_use]
    pub fn new(root_type: DataType) -> Self {
        Self { root_type }
    }
}

#[cfg(test)]
mod tests {
    use crate::model::{DataType, Field, ListType, Model, PrimitiveType, StructType};

    #[test]
    fn creates_model_with_nested_structures() {
        let model = Model::new(DataType::Struct(StructType::new(vec![
            Field::new("name", DataType::Primitive(PrimitiveType::String)),
            Field::new("age", DataType::Primitive(PrimitiveType::Integer)),
            Field::new(
                "tags",
                DataType::List(ListType::new(DataType::Primitive(PrimitiveType::String))),
            ),
        ])));

        assert_eq!(
            model,
            Model {
                root_type: DataType::Struct(StructType {
                    fields: vec![
                        Field {
                            name: "name".to_owned(),
                            field_type: DataType::Primitive(PrimitiveType::String),
                        },
                        Field {
                            name: "age".to_owned(),
                            field_type: DataType::Primitive(PrimitiveType::Integer),
                        },
                        Field {
                            name: "tags".to_owned(),
                            field_type: DataType::List(ListType {
                                element_type: Box::new(DataType::Primitive(PrimitiveType::String)),
                            }),
                        },
                    ],
                }),
            }
        );
    }
}
