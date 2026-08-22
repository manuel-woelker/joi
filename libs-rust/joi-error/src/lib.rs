//! Shared error and result types for JOI libraries.
//!
//! `JoiError` is an [`error_stack::Report`] with a boxed dynamic error context,
//! and `JoiResult` is a standard result whose error is a `JoiError`. This gives
//! JOI APIs one error type while retaining error-stack reports and attachments.

use std::{error::Error, fmt};

pub type JoiError = error_stack::Report<BoxedError>;
pub type JoiResult<T> = Result<T, JoiError>;

#[derive(Debug)]
pub struct BoxedError(Box<dyn Error + Send + Sync + 'static>);

impl BoxedError {
    pub fn new(error: impl Error + Send + Sync + 'static) -> Self {
        Self(Box::new(error))
    }

    pub fn downcast_ref<E: Error + 'static>(&self) -> Option<&E> {
        self.0.downcast_ref()
    }
}

impl fmt::Display for BoxedError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

impl Error for BoxedError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(self.0.as_ref())
    }
}

pub fn report(error: impl Error + Send + Sync + 'static) -> JoiError {
    JoiError::new(BoxedError::new(error))
}

#[cfg(test)]
mod tests {
    use std::{error::Error, fmt};

    use super::{JoiResult, report};

    #[derive(Debug, PartialEq, Eq)]
    struct ExampleError;

    impl fmt::Display for ExampleError {
        fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str("example error")
        }
    }

    impl Error for ExampleError {}

    fn fail() -> JoiResult<()> {
        Err(report(ExampleError))
    }

    #[test]
    fn aliases_error_stack_report_and_result() {
        let error = fail().unwrap_err();

        assert_eq!(
            error.current_context().downcast_ref::<ExampleError>(),
            Some(&ExampleError)
        );
        assert_eq!(error.to_string(), "example error");
    }
}
