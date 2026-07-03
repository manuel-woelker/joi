use serde::Serialize;

use crate::ast::{
    Declaration, Document, Field, OperationKind, Trivia, TriviaKind, TypeArgument, TypeExpression,
    TypeExpressionKind,
};

/// Stable JSON-ready representation consumed by standalone API documentation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiDocumentation {
    pub schema_version: u32,
    pub module: String,
    pub models: Vec<ApiModel>,
    pub operations: Vec<ApiOperation>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiModel {
    pub name: String,
    pub description: Option<String>,
    pub fields: Vec<ApiField>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiField {
    pub name: String,
    pub description: Option<String>,
    pub r#type: ApiType,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiOperation {
    pub kind: ApiOperationKind,
    pub name: String,
    pub description: Option<String>,
    pub parameters: Vec<ApiField>,
    pub returns: Vec<ApiField>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ApiOperationKind {
    Command,
    Query,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiType {
    pub name: String,
    pub arguments: Vec<ApiTypeArgument>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum ApiTypeArgument {
    Type(ApiType),
    String(String),
}

impl ApiDocumentation {
    pub fn from_document(document: &Document) -> Self {
        let mut models = Vec::new();
        let mut operations = Vec::new();

        for declaration in &document.declarations {
            match declaration {
                Declaration::Model(model) => models.push(ApiModel {
                    name: model.name.text.clone(),
                    description: description(&model.leading_trivia),
                    fields: model.fields.iter().map(ApiField::from).collect(),
                }),
                Declaration::Operation(operation) => operations.push(ApiOperation {
                    kind: match operation.kind.value {
                        OperationKind::Command => ApiOperationKind::Command,
                        OperationKind::Query => ApiOperationKind::Query,
                    },
                    name: operation.name.text.clone(),
                    description: description(&operation.leading_trivia),
                    parameters: operation
                        .parameters
                        .iter()
                        .map(|parameter| ApiField {
                            name: parameter.name.text.clone(),
                            description: description(&parameter.leading_trivia),
                            r#type: ApiType::from(&parameter.ty),
                        })
                        .collect(),
                    returns: operation
                        .returns
                        .iter()
                        .flat_map(|record| record.fields.iter())
                        .map(ApiField::from)
                        .collect(),
                }),
            }
        }

        Self {
            schema_version: 1,
            module: document.module.name.text.clone(),
            models,
            operations,
        }
    }
}

impl From<&Field> for ApiField {
    fn from(field: &Field) -> Self {
        Self {
            name: field.name.text.clone(),
            description: description(&field.leading_trivia),
            r#type: ApiType::from(&field.ty),
        }
    }
}

impl From<&TypeExpression> for ApiType {
    fn from(expression: &TypeExpression) -> Self {
        match &expression.kind {
            TypeExpressionKind::Named(identifier) => Self {
                name: identifier.text.clone(),
                arguments: Vec::new(),
            },
            TypeExpressionKind::Generic {
                constructor,
                arguments,
            } => Self {
                name: constructor.text.clone(),
                arguments: arguments
                    .iter()
                    .map(|argument| match argument {
                        TypeArgument::Type(expression) => {
                            ApiTypeArgument::Type(Self::from(expression))
                        }
                        TypeArgument::String(literal) => {
                            ApiTypeArgument::String(literal.value.clone())
                        }
                    })
                    .collect(),
            },
        }
    }
}

fn description(trivia: &Trivia) -> Option<String> {
    let lines: Vec<_> = trivia
        .iter()
        .filter_map(|piece| match &piece.kind {
            TriviaKind::LineComment { text } => Some(text.trim()),
            _ => None,
        })
        .filter(|line| !line.is_empty())
        .collect();

    (!lines.is_empty()).then(|| lines.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::{ApiDocumentation, ApiOperationKind, ApiTypeArgument};
    use crate::{parse, source_file::SourceFile};

    #[test]
    fn converts_parsed_document_to_documentation_shape() {
        let source = SourceFile::new(
            "ticket.joi-api",
            r#"module ticket;
// A support ticket.
model Ticket {
    id: id<Ticket>;
}
// Fetch tickets.
query get(ids: list<id<Ticket>>,) returns { tickets: list<Ticket>; }
"#,
        );
        let parsed = parse(&source);
        let documentation = ApiDocumentation::from_document(parsed.document.as_ref().unwrap());

        assert_eq!(documentation.module, "ticket");
        assert_eq!(
            documentation.models[0].description.as_deref(),
            Some("A support ticket.")
        );
        assert_eq!(documentation.operations[0].kind, ApiOperationKind::Query);
        assert_eq!(
            documentation.operations[0].description.as_deref(),
            Some("Fetch tickets.")
        );
        assert!(matches!(
            documentation.operations[0].parameters[0].r#type.arguments[0],
            ApiTypeArgument::Type(_)
        ));
    }
}
