use crate::lexer::LexerError;
use crate::source::SourceSpan;

/// A parsing error for template source text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseError {
    Lexer(LexerError),
    EmptySubstitution { span: SourceSpan },
    MalformedPath { span: SourceSpan },
    ExpectedClosingBrace { span: SourceSpan },
}

impl From<LexerError> for ParseError {
    fn from(value: LexerError) -> Self {
        Self::Lexer(value)
    }
}
