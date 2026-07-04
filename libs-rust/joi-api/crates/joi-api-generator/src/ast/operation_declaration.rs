use crate::{
    ast::{Documentation, Field, Identifier, Trivia, TypeExpression},
    span::{Span, Spanned},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum OperationKind {
    Command,
    Query,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OperationDeclaration {
    pub kind: Spanned<OperationKind>,
    pub name: Identifier,
    pub parameters: Vec<Parameter>,
    pub returns: Option<ReturnRecord>,
    pub documentation: Option<Documentation>,
    pub leading_trivia: Trivia,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Parameter {
    pub name: Identifier,
    pub ty: TypeExpression,
    pub documentation: Option<Documentation>,
    pub leading_trivia: Trivia,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReturnRecord {
    pub fields: Vec<Field>,
    pub span: Span,
}
