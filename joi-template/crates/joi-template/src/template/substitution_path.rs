use crate::source::SourceSpan;
use crate::template::Identifier;

/// A dotted path used inside a substitution.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SubstitutionPath<'a> {
    pub span: SourceSpan,
    pub segments: Vec<Identifier<'a>>,
}

impl<'a> SubstitutionPath<'a> {
    /// Creates a new substitution path.
    #[must_use]
    pub fn new(span: SourceSpan, segments: Vec<Identifier<'a>>) -> Self {
        Self { span, segments }
    }
}
