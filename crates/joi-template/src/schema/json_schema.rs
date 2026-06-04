use std::error::Error;
use std::fmt::{self, Display};

use serde_json::Value;

use crate::schema::{DataType, Field, ListType, PrimitiveType, StructType};

const UNSUPPORTED_KEYWORDS: &[&str] = &[
    "$ref",
    "oneOf",
    "anyOf",
    "allOf",
    "enum",
    "const",
    "minLength",
    "maxLength",
    "pattern",
    "format",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "minItems",
    "maxItems",
    "uniqueItems",
    "required",
    "additionalProperties",
    "patternProperties",
    "propertyNames",
    "minProperties",
    "maxProperties",
];

/// Errors produced while importing a template schema from JSON Schema.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JsonSchemaError {
    /// The input string is not valid JSON.
    InvalidJson { message: String },
    /// The JSON document is not a supported schema shape.
    InvalidSchema { path: String, message: String },
    /// The schema uses a JSON Schema keyword that `joi-template` cannot represent yet.
    UnsupportedFeature { path: String, feature: String },
    /// The schema declares a JSON Schema type that cannot map to `DataType`.
    UnsupportedType { path: String, type_name: String },
}

impl Display for JsonSchemaError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidJson { message } => write!(formatter, "invalid JSON: {message}"),
            Self::InvalidSchema { path, message } => {
                write!(formatter, "invalid JSON Schema at {path}: {message}")
            }
            Self::UnsupportedFeature { path, feature } => {
                write!(
                    formatter,
                    "unsupported JSON Schema feature `{feature}` at {path}"
                )
            }
            Self::UnsupportedType { path, type_name } => {
                write!(
                    formatter,
                    "unsupported JSON Schema type `{type_name}` at {path}"
                )
            }
        }
    }
}

impl Error for JsonSchemaError {}

impl DataType {
    /// Imports a template schema from a JSON Schema string.
    ///
    /// This supports the structural subset that maps directly to `DataType`:
    /// primitive `type` values, objects with `properties`, and arrays with a
    /// single item schema.
    ///
    /// # Examples
    ///
    /// ```
    /// use joi_template::schema::{DataType, PrimitiveType};
    ///
    /// let schema = DataType::from_json_schema_str(r#"{ "type": "string" }"#)?;
    ///
    /// assert_eq!(schema, DataType::Primitive(PrimitiveType::String));
    /// # Ok::<(), joi_template::schema::JsonSchemaError>(())
    /// ```
    pub fn from_json_schema_str(source: &str) -> Result<Self, JsonSchemaError> {
        let value = serde_json::from_str(source).map_err(|error| JsonSchemaError::InvalidJson {
            message: error.to_string(),
        })?;

        Self::from_json_schema_value(value)
    }

    /// Imports a template schema from a parsed JSON Schema value.
    ///
    /// Unsupported JSON Schema features fail explicitly instead of being ignored.
    ///
    /// # Examples
    ///
    /// ```
    /// use serde_json::json;
    ///
    /// use joi_template::schema::{DataType, PrimitiveType};
    ///
    /// let schema = DataType::from_json_schema_value(json!({ "type": "boolean" }))?;
    ///
    /// assert_eq!(schema, DataType::Primitive(PrimitiveType::Boolean));
    /// # Ok::<(), joi_template::schema::JsonSchemaError>(())
    /// ```
    pub fn from_json_schema_value(value: Value) -> Result<Self, JsonSchemaError> {
        convert_schema(&value, "$")
    }
}

fn convert_schema(value: &Value, path: &str) -> Result<DataType, JsonSchemaError> {
    let object = value
        .as_object()
        .ok_or_else(|| JsonSchemaError::InvalidSchema {
            path: path.to_owned(),
            message: "schema must be a JSON object".to_owned(),
        })?;

    reject_unsupported_keywords(object, path)?;

    let type_path = child_path(path, "type");
    let type_value = object
        .get("type")
        .ok_or_else(|| JsonSchemaError::InvalidSchema {
            path: type_path.clone(),
            message: "schema must declare a string type".to_owned(),
        })?;

    let type_name = match type_value {
        Value::String(type_name) => type_name.as_str(),
        Value::Array(_) => {
            return Err(JsonSchemaError::UnsupportedFeature {
                path: type_path,
                feature: "type array".to_owned(),
            });
        }
        _ => {
            return Err(JsonSchemaError::InvalidSchema {
                path: type_path,
                message: "schema type must be a string".to_owned(),
            });
        }
    };

    match type_name {
        "string" => Ok(DataType::Primitive(PrimitiveType::String)),
        "integer" => Ok(DataType::Primitive(PrimitiveType::Integer)),
        "number" => Ok(DataType::Primitive(PrimitiveType::Float)),
        "boolean" => Ok(DataType::Primitive(PrimitiveType::Boolean)),
        "object" => convert_object_schema(object, path),
        "array" => convert_array_schema(object, path),
        unsupported => Err(JsonSchemaError::UnsupportedType {
            path: type_path,
            type_name: unsupported.to_owned(),
        }),
    }
}

fn convert_object_schema(
    object: &serde_json::Map<String, Value>,
    path: &str,
) -> Result<DataType, JsonSchemaError> {
    let properties_path = child_path(path, "properties");
    let Some(properties) = object.get("properties") else {
        return Ok(DataType::Struct(StructType::new(Vec::new())));
    };

    let properties = properties
        .as_object()
        .ok_or_else(|| JsonSchemaError::InvalidSchema {
            path: properties_path.clone(),
            message: "object properties must be a JSON object".to_owned(),
        })?;

    let fields = properties
        .iter()
        .map(|(name, schema)| {
            let field_path = child_path(&properties_path, name);
            convert_schema(schema, &field_path).map(|field_type| Field::new(name, field_type))
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(DataType::Struct(StructType::new(fields)))
}

fn convert_array_schema(
    object: &serde_json::Map<String, Value>,
    path: &str,
) -> Result<DataType, JsonSchemaError> {
    let items_path = child_path(path, "items");
    let items = object
        .get("items")
        .ok_or_else(|| JsonSchemaError::InvalidSchema {
            path: items_path.clone(),
            message: "array schemas must declare a single item schema".to_owned(),
        })?;

    if items.is_array() {
        return Err(JsonSchemaError::UnsupportedFeature {
            path: items_path,
            feature: "tuple items".to_owned(),
        });
    }

    let element_type = convert_schema(items, &items_path)?;

    Ok(DataType::List(ListType::new(element_type)))
}

fn reject_unsupported_keywords(
    object: &serde_json::Map<String, Value>,
    path: &str,
) -> Result<(), JsonSchemaError> {
    if let Some(feature) = UNSUPPORTED_KEYWORDS
        .iter()
        .find(|keyword| object.contains_key(**keyword))
    {
        return Err(JsonSchemaError::UnsupportedFeature {
            path: child_path(path, feature),
            feature: (*feature).to_owned(),
        });
    }

    Ok(())
}

fn child_path(parent: &str, child: &str) -> String {
    format!("{parent}.{child}")
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::JsonSchemaError;
    use crate::schema::{DataType, Field, ListType, PrimitiveType, StructType};

    #[test]
    fn converts_primitive_types() {
        let cases = [
            (
                json!({ "type": "string" }),
                DataType::Primitive(PrimitiveType::String),
            ),
            (
                json!({ "type": "integer" }),
                DataType::Primitive(PrimitiveType::Integer),
            ),
            (
                json!({ "type": "number" }),
                DataType::Primitive(PrimitiveType::Float),
            ),
            (
                json!({ "type": "boolean" }),
                DataType::Primitive(PrimitiveType::Boolean),
            ),
        ];

        for (schema, expected) in cases {
            assert_eq!(DataType::from_json_schema_value(schema), Ok(expected));
        }
    }

    #[test]
    fn converts_nested_objects() {
        let schema = json!({
            "type": "object",
            "properties": {
                "user": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string" },
                        "is_admin": { "type": "boolean" }
                    }
                }
            }
        });

        assert_eq!(
            DataType::from_json_schema_value(schema),
            Ok(DataType::Struct(StructType::new(vec![Field::new(
                "user",
                DataType::Struct(StructType::new(vec![
                    Field::new("is_admin", DataType::Primitive(PrimitiveType::Boolean)),
                    Field::new("name", DataType::Primitive(PrimitiveType::String)),
                ])),
            )])))
        );
    }

    #[test]
    fn converts_arrays_of_primitives() {
        let schema = json!({
            "type": "array",
            "items": { "type": "string" }
        });

        assert_eq!(
            DataType::from_json_schema_value(schema),
            Ok(DataType::List(ListType::new(DataType::Primitive(
                PrimitiveType::String
            ))))
        );
    }

    #[test]
    fn converts_arrays_of_structs() {
        let schema = json!({
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": { "type": "string" }
                }
            }
        });

        assert_eq!(
            DataType::from_json_schema_value(schema),
            Ok(DataType::List(ListType::new(DataType::Struct(
                StructType::new(vec![Field::new(
                    "label",
                    DataType::Primitive(PrimitiveType::String),
                )])
            ))))
        );
    }

    #[test]
    fn rejects_malformed_json() {
        assert!(matches!(
            DataType::from_json_schema_str("{"),
            Err(JsonSchemaError::InvalidJson { .. })
        ));
    }

    #[test]
    fn rejects_non_object_root() {
        assert_eq!(
            DataType::from_json_schema_value(json!("string")),
            Err(JsonSchemaError::InvalidSchema {
                path: "$".to_owned(),
                message: "schema must be a JSON object".to_owned(),
            })
        );
    }

    #[test]
    fn rejects_missing_type() {
        assert_eq!(
            DataType::from_json_schema_value(json!({})),
            Err(JsonSchemaError::InvalidSchema {
                path: "$.type".to_owned(),
                message: "schema must declare a string type".to_owned(),
            })
        );
    }

    #[test]
    fn rejects_type_arrays() {
        assert_eq!(
            DataType::from_json_schema_value(json!({ "type": ["string", "null"] })),
            Err(JsonSchemaError::UnsupportedFeature {
                path: "$.type".to_owned(),
                feature: "type array".to_owned(),
            })
        );
    }

    #[test]
    fn rejects_refs() {
        assert_eq!(
            DataType::from_json_schema_value(json!({
                "$ref": "#/$defs/User"
            })),
            Err(JsonSchemaError::UnsupportedFeature {
                path: "$.$ref".to_owned(),
                feature: "$ref".to_owned(),
            })
        );
    }

    #[test]
    fn rejects_tuple_items() {
        assert_eq!(
            DataType::from_json_schema_value(json!({
                "type": "array",
                "items": [
                    { "type": "string" },
                    { "type": "integer" }
                ]
            })),
            Err(JsonSchemaError::UnsupportedFeature {
                path: "$.items".to_owned(),
                feature: "tuple items".to_owned(),
            })
        );
    }

    #[test]
    fn rejects_validation_keywords() {
        assert_eq!(
            DataType::from_json_schema_value(json!({
                "type": "string",
                "minLength": 1
            })),
            Err(JsonSchemaError::UnsupportedFeature {
                path: "$.minLength".to_owned(),
                feature: "minLength".to_owned(),
            })
        );
    }
}
