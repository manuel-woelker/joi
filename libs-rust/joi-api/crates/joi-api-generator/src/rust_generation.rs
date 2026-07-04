use std::collections::{BTreeMap, BTreeSet, HashMap};

use joi_template::{NativeDataSource, NativeValue, render};

use crate::{
    ast::{
        Declaration, Document, Documentation, Field, ModelDeclaration, OperationDeclaration,
        TypeArgument, TypeExpression, TypeExpressionKind,
    },
    diagnostic::Diagnostic,
    source_file::SourceFile,
    span::Span,
};

const FILE_TEMPLATE: &str = include_str!("../templates/rust/file.joi-template");
const ID_TEMPLATE: &str = include_str!("../templates/rust/id-newtype.joi-template");
const STRUCT_TEMPLATE: &str = include_str!("../templates/rust/struct.joi-template");
const FIELD_TEMPLATE: &str = include_str!("../templates/rust/field.joi-template");
const TRAIT_TEMPLATE: &str = include_str!("../templates/rust/service-trait.joi-template");
const METHOD_TEMPLATE: &str = include_str!("../templates/rust/service-method.joi-template");

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RustGenerationOutput {
    pub source: Option<String>,
    pub diagnostics: Vec<Diagnostic>,
}

pub fn generate_rust(document: &Document, source_file: &SourceFile) -> RustGenerationOutput {
    let mut builder = IrBuilder::new(document, source_file);
    let ir = builder.build();
    if !builder.diagnostics.is_empty() {
        return RustGenerationOutput {
            source: None,
            diagnostics: builder.diagnostics,
        };
    }

    RustGenerationOutput {
        source: Some(render_file(&ir.expect("IR exists without diagnostics"))),
        diagnostics: Vec::new(),
    }
}

#[derive(Debug)]
struct RustFile {
    module_docs: String,
    ids: Vec<RustId>,
    structs: Vec<RustStruct>,
    service: RustTrait,
}

#[derive(Debug)]
struct RustId {
    docs: String,
    name: String,
}

#[derive(Debug, Clone)]
struct RustStruct {
    docs: String,
    name: String,
    fields: Vec<RustField>,
}

#[derive(Debug, Clone)]
struct RustField {
    docs: String,
    name: String,
    type_name: String,
}

#[derive(Debug)]
struct RustTrait {
    docs: String,
    name: String,
    methods: Vec<RustMethod>,
}

#[derive(Debug)]
struct RustMethod {
    docs: String,
    name: String,
    input_type: String,
    output_type: String,
}

struct IrBuilder<'a> {
    document: &'a Document,
    source_file: &'a SourceFile,
    models: HashMap<&'a str, &'a ModelDeclaration>,
    diagnostics: Vec<Diagnostic>,
    used_ids: BTreeSet<String>,
    helper_structs: Vec<RustStruct>,
    generated_names: HashMap<String, Span>,
}

impl<'a> IrBuilder<'a> {
    fn new(document: &'a Document, source_file: &'a SourceFile) -> Self {
        Self {
            document,
            source_file,
            models: HashMap::new(),
            diagnostics: Vec::new(),
            used_ids: BTreeSet::new(),
            helper_structs: Vec::new(),
            generated_names: HashMap::new(),
        }
    }

    fn build(&mut self) -> Option<RustFile> {
        self.index_declarations();
        if !self.diagnostics.is_empty() {
            return None;
        }

        let mut structs = Vec::new();
        let mut methods = Vec::new();
        for declaration in &self.document.declarations {
            match declaration {
                Declaration::Model(model) => {
                    if let Some(model) = self.model(model) {
                        structs.push(model);
                    }
                }
                Declaration::Operation(operation) => {
                    if let Some((mut operation_structs, method)) = self.operation(operation) {
                        structs.append(&mut operation_structs);
                        methods.push(method);
                    }
                }
            }
        }
        structs.append(&mut self.helper_structs);

        let service_name = format!("{}Api", pascal_case(&self.document.module.name.text));
        self.register_generated_name(&service_name, self.document.module.name.span);
        if !self.diagnostics.is_empty() {
            return None;
        }

        let ids = self
            .used_ids
            .iter()
            .map(|model_name| RustId {
                docs: format!("/// Nominal identifier for [`{model_name}`].\n"),
                name: format!("{model_name}Id"),
            })
            .collect();
        Some(RustFile {
            module_docs: inner_docs(self.document.module.documentation.as_ref()),
            ids,
            structs,
            service: RustTrait {
                docs: docs(self.document.module.documentation.as_ref(), 0),
                name: service_name,
                methods,
            },
        })
    }

    fn index_declarations(&mut self) {
        let mut operation_names = HashMap::new();
        for declaration in &self.document.declarations {
            match declaration {
                Declaration::Model(model) => {
                    let rust_name = pascal_case(&model.name.text);
                    self.register_generated_name(&rust_name, model.name.span);
                    if let Some(previous) = self.models.insert(&model.name.text, model) {
                        self.duplicate(
                            "model",
                            &model.name.text,
                            model.name.span,
                            previous.name.span,
                        );
                    }
                    self.unique_fields("model field", &model.fields);
                }
                Declaration::Operation(operation) => {
                    let rust_name = snake_case(&operation.name.text);
                    if let Some(previous) = operation_names.insert(rust_name, operation.name.span) {
                        self.duplicate(
                            "operation",
                            &operation.name.text,
                            operation.name.span,
                            previous,
                        );
                    }
                    self.unique_named_spans(
                        "parameter",
                        operation
                            .parameters
                            .iter()
                            .map(|parameter| (&parameter.name.text, parameter.name.span)),
                    );
                    if let Some(returns) = &operation.returns {
                        self.unique_fields("return field", &returns.fields);
                    }
                }
            }
        }
    }

    fn model(&mut self, model: &ModelDeclaration) -> Option<RustStruct> {
        let mut fields = Vec::new();
        for field in &model.fields {
            let type_name = self.map_type(&field.ty, None)?;
            fields.push(RustField {
                docs: docs(field.documentation.as_ref(), 1),
                name: rust_value_name(&field.name.text),
                type_name,
            });
        }
        Some(RustStruct {
            docs: docs(model.documentation.as_ref(), 0),
            name: pascal_case(&model.name.text),
            fields,
        })
    }

    fn operation(
        &mut self,
        operation: &OperationDeclaration,
    ) -> Option<(Vec<RustStruct>, RustMethod)> {
        let operation_name = pascal_case(&operation.name.text);
        let input_name = format!("{operation_name}Input");
        self.register_generated_name(&input_name, operation.name.span);
        let mut input_fields = Vec::new();
        for parameter in &operation.parameters {
            let context = format!("{operation_name}{}Item", pascal_case(&parameter.name.text));
            let type_name = self.map_type(&parameter.ty, Some(&context))?;
            input_fields.push(RustField {
                docs: docs(parameter.documentation.as_ref(), 1),
                name: rust_value_name(&parameter.name.text),
                type_name,
            });
        }

        let mut structs = vec![RustStruct {
            docs: format!(
                "/// Input for [`{}Api::{}`].\n",
                pascal_case(&self.document.module.name.text),
                rust_value_name(&operation.name.text)
            ),
            name: input_name.clone(),
            fields: input_fields,
        }];
        let output_type = if let Some(returns) = &operation.returns {
            let output_name = format!("{operation_name}Output");
            self.register_generated_name(&output_name, operation.name.span);
            let mut output_fields = Vec::new();
            for field in &returns.fields {
                let context = format!("{operation_name}{}Item", pascal_case(&field.name.text));
                let type_name = self.map_type(&field.ty, Some(&context))?;
                output_fields.push(RustField {
                    docs: docs(field.documentation.as_ref(), 1),
                    name: rust_value_name(&field.name.text),
                    type_name,
                });
            }
            structs.push(RustStruct {
                docs: format!(
                    "/// Output from [`{}Api::{}`].\n",
                    pascal_case(&self.document.module.name.text),
                    rust_value_name(&operation.name.text)
                ),
                name: output_name.clone(),
                fields: output_fields,
            });
            output_name
        } else {
            "()".to_owned()
        };

        Some((
            structs,
            RustMethod {
                docs: docs(operation.documentation.as_ref(), 1),
                name: rust_value_name(&operation.name.text),
                input_type: input_name,
                output_type,
            },
        ))
    }

    fn map_type(&mut self, ty: &TypeExpression, helper_context: Option<&str>) -> Option<String> {
        match &ty.kind {
            TypeExpressionKind::Named(identifier) => match identifier.text.as_str() {
                "string" => Some("String".to_owned()),
                name if self.models.contains_key(name) => Some(pascal_case(name)),
                name => {
                    self.error(
                        "JAPI-G002",
                        format!("unknown type `{name}`"),
                        identifier.span,
                        "declare this model or use a supported built-in type",
                    );
                    None
                }
            },
            TypeExpressionKind::Generic {
                constructor,
                arguments,
            } => match constructor.text.as_str() {
                "id" => {
                    let model = self.single_model_argument("id", arguments, ty.span)?;
                    let model_name = pascal_case(&model.name.text);
                    if self.used_ids.insert(model_name.clone()) {
                        self.register_generated_name(&format!("{model_name}Id"), ty.span);
                    }
                    Some(format!("{model_name}Id"))
                }
                "list" => self
                    .single_type_argument("list", arguments, ty.span)
                    .and_then(|inner| self.map_type(inner, helper_context))
                    .map(|inner| format!("Vec<{inner}>")),
                "optional" => self
                    .single_type_argument("optional", arguments, ty.span)
                    .and_then(|inner| self.map_type(inner, helper_context))
                    .map(|inner| format!("Option<{inner}>")),
                "partialExcept" => self.partial_except(arguments, ty.span, helper_context),
                name => {
                    self.error(
                        "JAPI-G003",
                        format!("unsupported type constructor `{name}`"),
                        constructor.span,
                        "use id, list, optional, or partialExcept",
                    );
                    None
                }
            },
        }
    }

    fn partial_except(
        &mut self,
        arguments: &[TypeArgument],
        span: Span,
        helper_context: Option<&str>,
    ) -> Option<String> {
        let [
            TypeArgument::String(required),
            TypeArgument::Type(model_type),
        ] = arguments
        else {
            self.invalid_arguments(
                "partialExcept",
                span,
                "expected a field name and model type",
            );
            return None;
        };
        let model = self.model_from_type(model_type, "partialExcept", span)?;
        let Some(required_field) = model
            .fields
            .iter()
            .find(|field| field.name.text == required.value)
        else {
            self.error(
                "JAPI-G003",
                format!(
                    "model `{}` has no field `{}`",
                    model.name.text, required.value
                ),
                required.span,
                "name an existing model field",
            );
            return None;
        };
        let Some(helper_name) = helper_context else {
            self.error(
                "JAPI-G003",
                "partialExcept is only supported in operation types".to_owned(),
                span,
                "move this derived type to an operation input or output",
            );
            return None;
        };

        let model_fields = model.fields.clone();
        let model_docs = model.documentation.clone();
        let _ = required_field;
        let mut fields = Vec::new();
        for field in &model_fields {
            let mapped = self.map_type(&field.ty, None)?;
            fields.push(RustField {
                docs: docs(field.documentation.as_ref(), 1),
                name: rust_value_name(&field.name.text),
                type_name: if field.name.text == required.value {
                    mapped
                } else {
                    format!("Option<{mapped}>")
                },
            });
        }
        self.register_generated_name(helper_name, span);
        self.helper_structs.push(RustStruct {
            docs: docs(model_docs.as_ref(), 0),
            name: helper_name.to_owned(),
            fields,
        });
        Some(helper_name.to_owned())
    }

    fn single_type_argument<'b>(
        &mut self,
        name: &str,
        arguments: &'b [TypeArgument],
        span: Span,
    ) -> Option<&'b TypeExpression> {
        let [TypeArgument::Type(ty)] = arguments else {
            self.invalid_arguments(name, span, "expected exactly one type argument");
            return None;
        };
        Some(ty)
    }

    fn single_model_argument(
        &mut self,
        name: &str,
        arguments: &[TypeArgument],
        span: Span,
    ) -> Option<&'a ModelDeclaration> {
        let ty = self.single_type_argument(name, arguments, span)?;
        self.model_from_type(ty, name, span)
    }

    fn model_from_type(
        &mut self,
        ty: &TypeExpression,
        constructor: &str,
        span: Span,
    ) -> Option<&'a ModelDeclaration> {
        let TypeExpressionKind::Named(identifier) = &ty.kind else {
            self.invalid_arguments(constructor, span, "expected a declared model type");
            return None;
        };
        let Some(model) = self.models.get(identifier.text.as_str()) else {
            self.error(
                "JAPI-G002",
                format!("unknown model `{}`", identifier.text),
                identifier.span,
                "declare this model before using it here",
            );
            return None;
        };
        Some(*model)
    }

    fn invalid_arguments(&mut self, name: &str, span: Span, detail: &'static str) {
        self.error(
            "JAPI-G003",
            format!("invalid `{name}` arguments"),
            span,
            detail,
        );
    }

    fn unique_fields(&mut self, kind: &str, fields: &[Field]) {
        self.unique_named_spans(
            kind,
            fields
                .iter()
                .map(|field| (&field.name.text, field.name.span)),
        );
    }

    fn unique_named_spans<'b>(
        &mut self,
        kind: &str,
        values: impl Iterator<Item = (&'b String, Span)>,
    ) {
        let mut names = HashMap::new();
        for (name, span) in values {
            let rust_name = snake_case(name);
            if let Some(previous) = names.insert(rust_name, span) {
                self.duplicate(kind, name, span, previous);
            }
        }
    }

    fn register_generated_name(&mut self, name: &str, span: Span) {
        if is_rust_keyword(name) {
            self.error(
                "JAPI-G004",
                format!("generated Rust type name `{name}` is a keyword"),
                span,
                "rename this declaration",
            );
            return;
        }
        if let Some(previous) = self.generated_names.insert(name.to_owned(), span) {
            self.duplicate("generated Rust type", name, span, previous);
        }
    }

    fn duplicate(&mut self, kind: &str, name: &str, span: Span, previous: Span) {
        self.diagnostics.push(
            Diagnostic::error(
                "JAPI-G001",
                self.source_file.path(),
                format!("duplicate {kind} `{name}`"),
                span,
                "this generates the same Rust name",
            )
            .with_secondary(previous, "the first declaration is here"),
        );
    }

    fn error(&mut self, code: &'static str, summary: String, span: Span, label: &'static str) {
        self.diagnostics.push(Diagnostic::error(
            code,
            self.source_file.path(),
            summary,
            span,
            label,
        ));
    }
}

fn render_file(file: &RustFile) -> String {
    let ids = file
        .ids
        .iter()
        .map(|id| render_template(ID_TEMPLATE, &[("docs", &id.docs), ("name", &id.name)]))
        .collect::<Vec<_>>();
    let ids = joined_blocks(ids);
    let structs = joined_blocks(file.structs.iter().map(render_struct).collect());
    let methods = file
        .service
        .methods
        .iter()
        .map(|method| {
            render_template(
                METHOD_TEMPLATE,
                &[
                    ("docs", &method.docs),
                    ("name", &method.name),
                    ("input_type", &method.input_type),
                    ("output_type", &method.output_type),
                ],
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let service_trait = render_template(
        TRAIT_TEMPLATE,
        &[
            ("docs", &file.service.docs),
            ("name", &file.service.name),
            ("methods", &methods),
        ],
    );
    let output = render_template(
        FILE_TEMPLATE,
        &[
            ("module_docs", &file.module_docs),
            ("ids", &ids),
            ("structs", &structs),
            ("service_trait", &service_trait),
        ],
    );
    format!("{}\n", output.trim_end())
}

fn joined_blocks(blocks: Vec<String>) -> String {
    if blocks.is_empty() {
        String::new()
    } else {
        format!("{}\n", blocks.join("\n"))
    }
}

fn render_struct(value: &RustStruct) -> String {
    let fields = value
        .fields
        .iter()
        .map(|field| {
            render_template(
                FIELD_TEMPLATE,
                &[
                    ("docs", &field.docs),
                    ("name", &field.name),
                    ("type_name", &field.type_name),
                ],
            )
        })
        .collect::<String>();
    render_template(
        STRUCT_TEMPLATE,
        &[
            ("docs", &value.docs),
            ("name", &value.name),
            ("fields", &fields),
        ],
    )
}

fn render_template(template: &str, values: &[(&str, &str)]) -> String {
    let fields = values
        .iter()
        .map(|(name, value)| ((*name).to_owned(), NativeValue::string(*value)))
        .collect::<BTreeMap<_, _>>();
    render(
        template,
        &NativeDataSource::new(NativeValue::struct_(fields)),
    )
    .expect("embedded Rust templates and contexts must remain valid")
}

fn docs(documentation: Option<&Documentation>, indent: usize) -> String {
    documentation
        .map(|documentation| {
            documentation
                .text
                .lines()
                .map(|line| {
                    if line.is_empty() {
                        format!("{}///\n", "    ".repeat(indent))
                    } else {
                        format!("{}/// {line}\n", "    ".repeat(indent))
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

fn inner_docs(documentation: Option<&Documentation>) -> String {
    documentation
        .map(|documentation| {
            documentation
                .text
                .lines()
                .map(|line| {
                    if line.is_empty() {
                        "//!\n".to_owned()
                    } else {
                        format!("//! {line}\n")
                    }
                })
                .collect::<String>()
                + "\n"
        })
        .unwrap_or_default()
}

fn snake_case(name: &str) -> String {
    let mut output = String::new();
    for (index, character) in name.chars().enumerate() {
        if character == '_' || character == '-' {
            if !output.ends_with('_') {
                output.push('_');
            }
        } else if character.is_ascii_uppercase() {
            if index > 0 && !output.ends_with('_') {
                output.push('_');
            }
            output.push(character.to_ascii_lowercase());
        } else {
            output.push(character);
        }
    }
    output
}

fn pascal_case(name: &str) -> String {
    let snake = snake_case(name);
    snake
        .split('_')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut characters = part.chars();
            characters
                .next()
                .map(|first| first.to_ascii_uppercase().to_string() + characters.as_str())
                .unwrap_or_default()
        })
        .collect()
}

fn rust_value_name(name: &str) -> String {
    let name = snake_case(name);
    if is_rust_keyword(&name) {
        format!("r#{name}")
    } else {
        name
    }
}

fn is_rust_keyword(name: &str) -> bool {
    matches!(
        name,
        "as" | "break"
            | "const"
            | "continue"
            | "crate"
            | "else"
            | "enum"
            | "extern"
            | "false"
            | "fn"
            | "for"
            | "if"
            | "impl"
            | "in"
            | "let"
            | "loop"
            | "match"
            | "mod"
            | "move"
            | "mut"
            | "pub"
            | "ref"
            | "return"
            | "self"
            | "Self"
            | "static"
            | "struct"
            | "super"
            | "trait"
            | "true"
            | "type"
            | "unsafe"
            | "use"
            | "where"
            | "while"
            | "async"
            | "await"
            | "dyn"
            | "abstract"
            | "become"
            | "box"
            | "do"
            | "final"
            | "macro"
            | "override"
            | "priv"
            | "typeof"
            | "unsized"
            | "virtual"
            | "yield"
            | "try"
    )
}

#[cfg(test)]
mod tests {
    use super::{generate_rust, pascal_case, snake_case};
    use crate::{parse, source_file::SourceFile};

    #[test]
    fn converts_names_deterministically() {
        assert_eq!(snake_case("ticketIds"), "ticket_ids");
        assert_eq!(pascal_case("ticketIds"), "TicketIds");
        assert_eq!(snake_case("HTTPServer"), "h_t_t_p_server");
    }

    #[test]
    fn reports_unknown_types_at_the_type_span() {
        let source = SourceFile::new("bad.joi-api", "module x; model A { value: Missing; }");
        let document = parse(&source).document.unwrap();
        let output = generate_rust(&document, &source);

        assert!(output.source.is_none());
        assert_eq!(output.diagnostics[0].code, "JAPI-G002");
        assert_eq!(
            source.span_text(output.diagnostics[0].primary.span),
            Some("Missing")
        );
    }

    #[test]
    fn validates_builtin_argument_shapes() {
        let source = SourceFile::new("bad.joi-api", "module x; model A { value: list<\"x\">; }");
        let document = parse(&source).document.unwrap();
        let output = generate_rust(&document, &source);

        assert!(output.source.is_none());
        assert_eq!(output.diagnostics[0].code, "JAPI-G003");
    }

    #[test]
    fn emits_raw_identifiers_for_rust_keyword_fields() {
        let source = SourceFile::new("keywords.joi-api", "module x; model Item { type: string; }");
        let document = parse(&source).document.unwrap();
        let output = generate_rust(&document, &source);

        assert_eq!(output.diagnostics, []);
        assert!(output.source.unwrap().contains("pub r#type: String"));
    }

    #[test]
    fn diagnoses_generated_type_name_collisions() {
        let source = SourceFile::new(
            "collision.joi-api",
            "module x; model CreateInput {} command create()",
        );
        let document = parse(&source).document.unwrap();
        let output = generate_rust(&document, &source);

        assert!(output.source.is_none());
        assert_eq!(output.diagnostics[0].code, "JAPI-G001");
        assert_eq!(output.diagnostics[0].secondary.len(), 1);
    }

    #[test]
    fn diagnoses_unknown_partial_except_fields() {
        let source = SourceFile::new(
            "partial.joi-api",
            "module x; model Item { id: string; } command update(value: partialExcept<\"missing\", Item>)",
        );
        let document = parse(&source).document.unwrap();
        let output = generate_rust(&document, &source);

        assert!(output.source.is_none());
        assert_eq!(output.diagnostics[0].code, "JAPI-G003");
        assert_eq!(
            source.span_text(output.diagnostics[0].primary.span),
            Some("\"missing\"")
        );
    }
}
