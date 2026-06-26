use crate::source::SourceOffset;

/// A half-open byte range into source text.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SourceSpan {
    pub start: SourceOffset,
    pub end: SourceOffset,
}

impl SourceSpan {
    /// Creates a new source span from explicit offsets.
    #[must_use]
    pub fn new(start: SourceOffset, end: SourceOffset) -> Self {
        Self { start, end }
    }

    /// Creates a source span from raw byte offsets.
    #[must_use]
    pub fn from_range(start: usize, end: usize) -> Self {
        Self::new(SourceOffset::new(start), SourceOffset::new(end))
    }

    /// Creates a span that covers two existing spans.
    #[must_use]
    pub fn cover(start: SourceSpan, end: SourceSpan) -> Self {
        Self::new(start.start, end.end)
    }
}
