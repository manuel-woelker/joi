use crate::source::SourceSpan;
use crate::template::TemplateSegment;

/// A parsed template file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Template<'a> {
    pub span: SourceSpan,
    pub segments: Vec<TemplateSegment<'a>>,
}

impl<'a> Template<'a> {
    /// Creates a new template AST node.
    #[must_use]
    pub fn new(span: SourceSpan, segments: Vec<TemplateSegment<'a>>) -> Self {
        Self { span, segments }
    }
}
