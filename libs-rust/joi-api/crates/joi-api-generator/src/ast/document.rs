use crate::{
    ast::{Declaration, Identifier, Trivia},
    span::Span,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Document {
    pub module: ModuleDeclaration,
    pub declarations: Vec<Declaration>,
    pub trailing_trivia: Trivia,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModuleDeclaration {
    pub name: Identifier,
    pub leading_trivia: Trivia,
    pub span: Span,
}
