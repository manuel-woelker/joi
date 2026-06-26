use crate::source::SourceSpan;

/// A lexing error for template source text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LexerError {
    UnexpectedClosingBrace { span: SourceSpan },
    UnterminatedSubstitution { span: SourceSpan },
    InvalidCharacterInSubstitution { span: SourceSpan, character: char },
}
