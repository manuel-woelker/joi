use crate::{
    ast::{Identifier, StringLiteral},
    span::Span,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TypeExpression {
    pub kind: TypeExpressionKind,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TypeExpressionKind {
    Named(Identifier),
    Generic {
        constructor: Identifier,
        arguments: Vec<TypeArgument>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TypeArgument {
    Type(TypeExpression),
    String(StringLiteral),
}

impl TypeArgument {
    pub const fn span(&self) -> Span {
        match self {
            Self::Type(ty) => ty.span,
            Self::String(literal) => literal.span,
        }
    }
}
