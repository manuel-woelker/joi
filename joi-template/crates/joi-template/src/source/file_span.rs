use std::ops::Range;

use crate::shared_string::SharedString;

/// A half-open byte range in a named source file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileSpan {
    /// The source filename or logical source identifier.
    pub filename: SharedString<'static>,
    /// The half-open byte range within the file.
    pub byte_range: Range<usize>,
}

impl FileSpan {
    /// Creates a new file span from a filename and half-open byte range.
    #[must_use]
    pub fn new(filename: impl Into<String>, byte_range: Range<usize>) -> Self {
        Self::from_shared(SharedString::Owned(filename.into()), byte_range)
    }

    /// Creates a new file span from a shared filename and half-open byte range.
    #[must_use]
    pub fn from_shared(filename: SharedString<'static>, byte_range: Range<usize>) -> Self {
        Self {
            filename,
            byte_range,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::FileSpan;

    #[test]
    fn stores_filename_and_byte_range() {
        let span = FileSpan::new("schema.json", 4..20);

        assert_eq!(span.filename, "schema.json");
        assert_eq!(span.byte_range, 4..20);
    }
}
