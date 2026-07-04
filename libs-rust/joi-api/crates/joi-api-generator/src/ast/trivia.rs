use crate::span::Span;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TriviaKind {
    Whitespace,
    Newlines { count: usize },
    LineComment { text: String },
    DocumentationComment { text: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TriviaPiece {
    pub kind: TriviaKind,
    pub span: Span,
}

impl TriviaPiece {
    pub const fn new(kind: TriviaKind, span: Span) -> Self {
        Self { kind, span }
    }
}

pub type Trivia = Vec<TriviaPiece>;
