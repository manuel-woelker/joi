use crate::runtime::ValueKind;

/// A shared error type for runtime data access failures.
#[derive(Debug, Clone, PartialEq)]
pub enum DataError {
    TypeMismatch {
        expected: &'static str,
        actual: ValueKind,
    },
    Backend {
        message: String,
    },
}
