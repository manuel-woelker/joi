use crate::model::PrimitiveType;
use crate::runtime::{DataError, NativeListIter, NativeValue, ValueKind, ValueView};

/// A borrowed runtime view over a native in-memory value.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NativeValueView<'a> {
    value: &'a NativeValue,
}

impl<'a> NativeValueView<'a> {
    /// Creates a new native value view.
    #[must_use]
    pub fn new(value: &'a NativeValue) -> Self {
        Self { value }
    }
}

impl<'a> ValueView<'a> for NativeValueView<'a> {
    type ListIter = NativeListIter<'a>;

    fn kind(&self) -> ValueKind {
        match self.value {
            NativeValue::String(_) => ValueKind::Primitive(PrimitiveType::String),
            NativeValue::Boolean(_) => ValueKind::Primitive(PrimitiveType::Boolean),
            NativeValue::Integer(_) => ValueKind::Primitive(PrimitiveType::Integer),
            NativeValue::Float(_) => ValueKind::Primitive(PrimitiveType::Float),
            NativeValue::Struct(_) => ValueKind::Struct,
            NativeValue::List(_) => ValueKind::List,
        }
    }

    fn as_str(&self) -> Result<&'a str, DataError> {
        match self.value {
            NativeValue::String(value) => Ok(value.as_str()),
            _ => Err(type_mismatch("string", self.kind())),
        }
    }

    fn as_bool(&self) -> Result<bool, DataError> {
        match self.value {
            NativeValue::Boolean(value) => Ok(*value),
            _ => Err(type_mismatch("boolean", self.kind())),
        }
    }

    fn as_i64(&self) -> Result<i64, DataError> {
        match self.value {
            NativeValue::Integer(value) => Ok(*value),
            _ => Err(type_mismatch("integer", self.kind())),
        }
    }

    fn as_f64(&self) -> Result<f64, DataError> {
        match self.value {
            NativeValue::Float(value) => Ok(*value),
            _ => Err(type_mismatch("float", self.kind())),
        }
    }

    fn field(&self, name: &str) -> Result<Option<Self>, DataError> {
        match self.value {
            NativeValue::Struct(fields) => Ok(fields.get(name).map(Self::new)),
            _ => Err(type_mismatch("struct", self.kind())),
        }
    }

    fn elements(&self) -> Result<Self::ListIter, DataError> {
        match self.value {
            NativeValue::List(values) => Ok(NativeListIter::new(values.iter())),
            _ => Err(type_mismatch("list", self.kind())),
        }
    }
}

fn type_mismatch(expected: &'static str, actual: ValueKind) -> DataError {
    DataError::TypeMismatch { expected, actual }
}
