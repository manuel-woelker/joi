use crate::source::SourceSpan;
use crate::template::{Substitution, TextSegment};

/// A top-level template segment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TemplateSegment<'a> {
    Text(TextSegment<'a>),
    Substitution(Substitution<'a>),
}

impl<'a> TemplateSegment<'a> {
    /// Returns the span for this segment.
    #[must_use]
    pub fn span(&self) -> SourceSpan {
        match self {
            Self::Text(text) => text.span,
            Self::Substitution(substitution) => substitution.span,
        }
    }
}
