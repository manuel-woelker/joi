use std::collections::BTreeMap;

/// A native in-memory runtime value for template data.
#[derive(Debug, Clone, PartialEq)]
pub enum NativeValue {
    String(String),
    Boolean(bool),
    Integer(i64),
    Float(f64),
    Struct(BTreeMap<String, NativeValue>),
    List(Vec<NativeValue>),
}

impl NativeValue {
    /// Creates a string value.
    #[must_use]
    pub fn string(value: impl Into<String>) -> Self {
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
