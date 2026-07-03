use crate::{
    ast::{ModelDeclaration, OperationDeclaration, Trivia},
    span::Span,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Declaration {
    Model(ModelDeclaration),
    Operation(OperationDeclaration),
}

impl Declaration {
    pub const fn span(&self) -> Span {
        match self {
            Self::Model(model) => model.span,
            Self::Operation(operation) => operation.span,
        }
    }

    pub fn leading_trivia(&self) -> &Trivia {
        match self {
            Self::Model(model) => &model.leading_trivia,
            Self::Operation(operation) => &operation.leading_trivia,
        }
    }
}
