use crate::lexer::LexerError;
use crate::source::SourceSpan;

/// A parsing error for template source text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseError {
    Lexer(LexerError),
    EmptySubstitution {
        span: SourceSpan,
    },
    MalformedPath {
        span: SourceSpan,
    },
    ExpectedClosingBrace {
        span: SourceSpan,
    },
    UnexpectedToken {
        span: SourceSpan,
        expected: &'static str,
    },
    UnknownDirective {
        span: SourceSpan,
    },
    UnexpectedEnd {
        span: SourceSpan,
    },
    MissingFragmentEnd {
        span: SourceSpan,
    },
    NestedFragment {
        span: SourceSpan,
    },
    UnsupportedParameterType {
        span: SourceSpan,
    },
    DuplicateFragment {
        span: SourceSpan,
    },
    DuplicateParameter {
        span: SourceSpan,
    },
    DuplicateArgument {
        span: SourceSpan,
    },
    UnknownFragment {
        span: SourceSpan,
    },
    UnknownArgument {
        span: SourceSpan,
    },
    MissingArgument {
        span: SourceSpan,
    },
    RecursiveFragment {
        span: SourceSpan,
    },
}

impl From<LexerError> for ParseError {
    fn from(value: LexerError) -> Self {
        Self::Lexer(value)
    }
}
