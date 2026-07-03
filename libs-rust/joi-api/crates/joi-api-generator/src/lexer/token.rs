use crate::{ast::Trivia, span::Span};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TokenKind {
    Module,
    Model,
    Command,
    Query,
    Returns,
    Identifier,
    StringLiteral,
    Colon,
    Comma,
    Semicolon,
    LessThan,
    GreaterThan,
    LeftParen,
    RightParen,
    LeftBrace,
    RightBrace,
    Unexpected,
    EndOfFile,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Token {
    pub kind: TokenKind,
    pub leading_trivia: Trivia,
    pub span: Span,
}

impl Token {
    pub const fn new(kind: TokenKind, leading_trivia: Trivia, span: Span) -> Self {
        Self {
            kind,
            leading_trivia,
            span,
        }
    }
}
