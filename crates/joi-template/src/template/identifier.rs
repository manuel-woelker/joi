use crate::shared_string::SharedString;
use crate::source::SourceSpan;

/// An identifier used inside a substitution path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Identifier<'a> {
    pub span: SourceSpan,
    pub name: SharedString<'a>,
}

impl<'a> Identifier<'a> {
    /// Creates a new identifier node.
    #[must_use]
    pub fn new(span: SourceSpan, name: SharedString<'a>) -> Self {
        Self { span, name }
    }
}
