use crate::runtime::ValueKind;
use joi_base::JoiString;

/// A shared error type for runtime data access failures.
#[derive(Debug, Clone, PartialEq)]
pub enum DataError {
    TypeMismatch {
        expected: &'static str,
        actual: ValueKind,
    },
    Backend {
        message: JoiString,
    },
}
