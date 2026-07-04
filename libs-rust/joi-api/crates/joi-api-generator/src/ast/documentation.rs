use crate::span::Span;

/// Explicit API documentation attached to a syntax node.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Documentation {
    pub text: String,
    pub span: Span,
}

impl Documentation {
    pub fn new(text: impl Into<String>, span: Span) -> Self {
        Self {
            text: text.into(),
            span,
        }
    }
}
