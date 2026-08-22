use crate::span::Span;
use joi_base::JoiString;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TriviaKind {
    Whitespace,
    Newlines { count: usize },
    LineComment { text: JoiString },
    DocumentationComment { text: JoiString },
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
