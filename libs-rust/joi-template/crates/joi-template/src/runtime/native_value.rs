use joi_base::JoiString;
use std::collections::BTreeMap;

use crate::runtime::{DataError, NativeListIter, ValueKind, ValueView};
use crate::schema::PrimitiveType;

/// A native in-memory runtime value for template data.
#[derive(Debug, Clone, PartialEq)]
pub enum NativeValue {
    String(JoiString),
    Boolean(bool),
    Integer(i64),
    Float(f64),
    Struct(BTreeMap<String, NativeValue>),
    List(Vec<NativeValue>),
}

impl NativeValue {
    /// Creates a string value.
    #[must_use]
    pub fn string(value: impl Into<JoiString>) -> Self {
        Self::String(value.into())
    }

    /// Creates a boolean value.
    #[must_use]
    pub fn boolean(value: bool) -> Self {
        Self::Boolean(value)
    }

    /// Creates an integer value.
    #[must_use]
    pub fn integer(value: i64) -> Self {
        Self::Integer(value)
    }

    /// Creates a float value.
    #[must_use]
    pub fn float(value: f64) -> Self {
        Self::Float(value)
    }

    /// Creates a struct value.
    #[must_use]
    pub fn struct_(fields: BTreeMap<String, NativeValue>) -> Self {
        Self::Struct(fields)
    }

    /// Creates a list value.
    #[must_use]
    pub fn list(values: Vec<NativeValue>) -> Self {
        Self::List(values)
    }
}

impl<'a> ValueView<'a> for &'a NativeValue {
    type ListIter = NativeListIter<'a>;

    fn kind(&self) -> ValueKind {
        match self {
            NativeValue::String(_) => ValueKind::Primitive(PrimitiveType::String),
            NativeValue::Boolean(_) => ValueKind::Primitive(PrimitiveType::Boolean),
            NativeValue::Integer(_) => ValueKind::Primitive(PrimitiveType::Integer),
            NativeValue::Float(_) => ValueKind::Primitive(PrimitiveType::Float),
            NativeValue::Struct(_) => ValueKind::Struct,
            NativeValue::List(_) => ValueKind::List,
        }
    }

    fn as_str(&self) -> Result<&'a str, DataError> {
        match self {
            NativeValue::String(value) => Ok(value.as_str()),
            _ => Err(type_mismatch("string", self.kind())),
        }
    }

    fn as_bool(&self) -> Result<bool, DataError> {
        match self {
            NativeValue::Boolean(value) => Ok(*value),
            _ => Err(type_mismatch("boolean", self.kind())),
        }
    }

    fn as_i64(&self) -> Result<i64, DataError> {
        match self {
            NativeValue::Integer(value) => Ok(*value),
            _ => Err(type_mismatch("integer", self.kind())),
        }
    }

    fn as_f64(&self) -> Result<f64, DataError> {
        match self {
            NativeValue::Float(value) => Ok(*value),
            _ => Err(type_mismatch("float", self.kind())),
        }
    }

    fn field(&self, name: &str) -> Result<Option<Self>, DataError> {
        match self {
            NativeValue::Struct(fields) => Ok(fields.get(name)),
            _ => Err(type_mismatch("struct", self.kind())),
        }
    }

    fn elements(&self) -> Result<Self::ListIter, DataError> {
        match self {
            NativeValue::List(values) => Ok(NativeListIter::new(values.iter())),
            _ => Err(type_mismatch("list", self.kind())),
        }
    }
}

fn type_mismatch(expected: &'static str, actual: ValueKind) -> DataError {
    DataError::TypeMismatch { expected, actual }
}
