use crate::{
    ast::{Documentation, Identifier, Trivia, TypeExpression},
    span::Span,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelDeclaration {
    pub name: Identifier,
    pub fields: Vec<Field>,
    pub documentation: Option<Documentation>,
    pub leading_trivia: Trivia,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Field {
    pub name: Identifier,
    pub ty: TypeExpression,
    pub documentation: Option<Documentation>,
    pub leading_trivia: Trivia,
    pub span: Span,
}
