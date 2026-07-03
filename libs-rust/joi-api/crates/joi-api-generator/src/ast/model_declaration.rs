use crate::{
    ast::{Identifier, Trivia, TypeExpression},
    span::Span,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelDeclaration {
    pub name: Identifier,
    pub fields: Vec<Field>,
    pub leading_trivia: Trivia,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Field {
    pub name: Identifier,
    pub ty: TypeExpression,
    pub leading_trivia: Trivia,
    pub span: Span,
}
