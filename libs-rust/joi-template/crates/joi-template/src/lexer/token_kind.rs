use crate::shared_string::SharedString;

/// The kinds of tokens produced by the template lexer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TokenKind<'a> {
    Text(SharedString<'a>),
    Identifier(SharedString<'a>),
    LeftBrace,
    RightBrace,
    Dot,
    At,
    Colon,
    Equals,
    Comma,
    LeftParenthesis,
    RightParenthesis,
    EndOfFile,
}
