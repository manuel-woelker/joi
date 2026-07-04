use crate::source::SourceSpan;
use crate::template::{FragmentDefinition, TemplateSegment};

/// A parsed template file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Template<'a> {
    pub span: SourceSpan,
    pub segments: Vec<TemplateSegment<'a>>,
    pub fragments: Vec<FragmentDefinition<'a>>,
}

impl<'a> Template<'a> {
    /// Creates a new template AST node.
    #[must_use]
    pub fn new(span: SourceSpan, segments: Vec<TemplateSegment<'a>>) -> Self {
        Self {
            span,
            segments,
            fragments: Vec::new(),
        }
    }

    /// Creates a template containing reusable fragment declarations.
    #[must_use]
    pub fn with_fragments(
        span: SourceSpan,
        segments: Vec<TemplateSegment<'a>>,
        fragments: Vec<FragmentDefinition<'a>>,
    ) -> Self {
        Self {
            span,
            segments,
            fragments,
        }
    }
}
