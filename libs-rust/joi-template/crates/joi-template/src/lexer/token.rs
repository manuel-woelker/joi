use crate::lexer::TokenKind;
use crate::source::SourceSpan;

/// A single token produced by the template lexer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Token<'a> {
    pub span: SourceSpan,
    pub kind: TokenKind<'a>,
}

impl<'a> Token<'a> {
    /// Creates a new token.
    #[must_use]
    pub fn new(span: SourceSpan, kind: TokenKind<'a>) -> Self {
        Self { span, kind }
    }
}
