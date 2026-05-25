use crate::source::SourceSpan;
use crate::template::SubstitutionPath;

/// A substitution segment surrounded by `{` and `}`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Substitution<'a> {
    pub span: SourceSpan,
    pub path: SubstitutionPath<'a>,
}

impl<'a> Substitution<'a> {
    /// Creates a new substitution node.
    #[must_use]
    pub fn new(span: SourceSpan, path: SubstitutionPath<'a>) -> Self {
        Self { span, path }
    }
}
