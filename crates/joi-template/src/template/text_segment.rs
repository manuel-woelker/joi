use crate::shared_string::SharedString;
use crate::source::SourceSpan;

/// A plain text segment in a template.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextSegment<'a> {
    pub span: SourceSpan,
    pub text: SharedString<'a>,
}

impl<'a> TextSegment<'a> {
    /// Creates a new text segment node.
    #[must_use]
    pub fn new(span: SourceSpan, text: SharedString<'a>) -> Self {
        Self { span, text }
    }
}
