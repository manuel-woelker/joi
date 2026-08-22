use joi_base::JoiString;
use serde::Serialize;

use crate::ast::{
    Declaration, Document, Field, OperationKind, TypeArgument, TypeExpression, TypeExpressionKind,
};

/// Stable JSON-ready representation consumed by standalone API documentation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiDocumentation {
    pub schema_version: u32,
    pub module: JoiString,
    pub description: Option<JoiString>,
    pub models: Vec<ApiModel>,
    pub operations: Vec<ApiOperation>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiModel {
    pub name: JoiString,
    pub description: Option<JoiString>,
    pub fields: Vec<ApiField>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiField {
    pub name: JoiString,
    pub description: Option<JoiString>,
    pub r#type: ApiType,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiOperation {
    pub kind: ApiOperationKind,
    pub name: JoiString,
    pub description: Option<JoiString>,
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
    pub name: JoiString,
    pub arguments: Vec<ApiTypeArgument>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum ApiTypeArgument {
    Type(ApiType),
    String(JoiString),
}

impl ApiDocumentation {
    pub fn from_document(document: &Document) -> Self {
        let mut models = Vec::new();
        let mut operations = Vec::new();

        for declaration in &document.declarations {
            match declaration {
                Declaration::Model(model) => models.push(ApiModel {
                    name: model.name.text.clone(),
                    description: documentation_text(model.documentation.as_ref()),
                    fields: model.fields.iter().map(ApiField::from).collect(),
                }),
                Declaration::Operation(operation) => operations.push(ApiOperation {
                    kind: match operation.kind.value {
                        OperationKind::Command => ApiOperationKind::Command,
                        OperationKind::Query => ApiOperationKind::Query,
                    },
                    name: operation.name.text.clone(),
                    description: documentation_text(operation.documentation.as_ref()),
                    parameters: operation
                        .parameters
                        .iter()
                        .map(|parameter| ApiField {
                            name: parameter.name.text.clone(),
                            description: documentation_text(parameter.documentation.as_ref()),
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
            description: documentation_text(document.module.documentation.as_ref()),
            models,
            operations,
        }
    }
}

impl From<&Field> for ApiField {
    fn from(field: &Field) -> Self {
        Self {
            name: field.name.text.clone(),
            description: documentation_text(field.documentation.as_ref()),
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

fn documentation_text(documentation: Option<&crate::ast::Documentation>) -> Option<JoiString> {
    documentation.map(|documentation| documentation.text.clone())
}

#[cfg(test)]
mod tests {
    use super::{ApiDocumentation, ApiOperationKind, ApiTypeArgument};
    use crate::{parse, source_file::SourceFile};

    #[test]
    fn converts_parsed_document_to_documentation_shape() {
        let source = SourceFile::new(
            "ticket.joi-api",
            r#"/// Issue tracking.
module ticket;
// Internal implementation note.
/// A work item representing a bug, task, or issue.
model Ticket {
    /// Stable identifier.
    id: id<Ticket>;
}
/// Fetch tickets.
query get(
    /// IDs to retrieve.
    ids: list<id<Ticket>>,
) returns {
    /// Tickets that were found.
    tickets: list<Ticket>;
}
"#,
        );
        let parsed = parse(&source);
        let documentation = ApiDocumentation::from_document(parsed.document.as_ref().unwrap());

        assert_eq!(documentation.module, "ticket");
        assert_eq!(
            documentation.description.as_deref(),
            Some("Issue tracking.")
        );
        assert_eq!(
            documentation.models[0].description.as_deref(),
            Some("A work item representing a bug, task, or issue.")
        );
        assert_eq!(documentation.operations[0].kind, ApiOperationKind::Query);
        assert_eq!(
            documentation.operations[0].description.as_deref(),
            Some("Fetch tickets.")
        );
        assert_eq!(
            documentation.operations[0].parameters[0]
                .description
                .as_deref(),
            Some("IDs to retrieve.")
        );
        assert_eq!(
            documentation.operations[0].returns[0]
                .description
                .as_deref(),
            Some("Tickets that were found.")
        );
        assert!(matches!(
            documentation.operations[0].parameters[0].r#type.arguments[0],
            ApiTypeArgument::Type(_)
        ));
    }
}
