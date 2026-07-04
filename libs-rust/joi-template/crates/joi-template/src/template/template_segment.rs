use crate::source::SourceSpan;
use crate::template::{FragmentRender, Substitution, TextSegment};

/// A top-level template segment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TemplateSegment<'a> {
    Text(TextSegment<'a>),
    Substitution(Substitution<'a>),
    FragmentRender(FragmentRender<'a>),
}

impl<'a> TemplateSegment<'a> {
    /// Returns the span for this segment.
    #[must_use]
    pub fn span(&self) -> SourceSpan {
        match self {
            Self::Text(text) => text.span,
            Self::Substitution(substitution) => substitution.span,
            Self::FragmentRender(render) => render.span,
        }
    }
}
