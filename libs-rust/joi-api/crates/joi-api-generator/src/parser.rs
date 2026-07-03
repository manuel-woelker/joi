use crate::{
    ast::{
        Declaration, Document, Field, Identifier, ModelDeclaration, ModuleDeclaration,
        OperationDeclaration, OperationKind, Parameter, ReturnRecord, StringLiteral, TypeArgument,
        TypeExpression, TypeExpressionKind,
    },
    diagnostic::Diagnostic,
    lexer::{Token, TokenKind, lex},
    source_file::SourceFile,
    span::{Span, Spanned},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseOutput {
    pub document: Option<Document>,
    pub diagnostics: Vec<Diagnostic>,
}

/// Parses one JOI API source file.
pub fn parse(source_file: &SourceFile) -> ParseOutput {
    let lexed = lex(source_file);
    let lexer_could_not_finish = lexed
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == "JAPI-L002");
    if lexer_could_not_finish {
        return ParseOutput {
            document: None,
            diagnostics: lexed.diagnostics,
        };
    }

    Parser::new(source_file, lexed.tokens, lexed.diagnostics).parse()
}

struct Parser<'a> {
    source_file: &'a SourceFile,
    tokens: Vec<Token>,
    position: usize,
    diagnostics: Vec<Diagnostic>,
}

impl<'a> Parser<'a> {
    fn new(source_file: &'a SourceFile, tokens: Vec<Token>, diagnostics: Vec<Diagnostic>) -> Self {
        Self {
            source_file,
            tokens,
            position: 0,
            diagnostics,
        }
    }

    fn parse(mut self) -> ParseOutput {
        self.skip_unexpected_tokens();
        let Some(module) = self.parse_required_module() else {
            return ParseOutput {
                document: None,
                diagnostics: self.diagnostics,
            };
        };

        let mut declarations = Vec::new();
        while !self.at(TokenKind::EndOfFile) {
            self.skip_unexpected_tokens();
            if self.at(TokenKind::EndOfFile) {
                break;
            }

            let declaration = match self.current().kind {
                TokenKind::Model => self.parse_model().map(Declaration::Model),
                TokenKind::Command | TokenKind::Query => {
                    self.parse_operation().map(Declaration::Operation)
                }
                TokenKind::Module => {
                    self.report_duplicate_module(module.span);
                    self.consume_duplicate_module();
                    None
                }
                _ => {
                    let span = self.current().span;
                    self.emit(
                        "JAPI-P004",
                        "unexpected top-level syntax",
                        span,
                        "expected `model`, `command`, or `query`",
                    );
                    self.advance();
                    None
                }
            };

            if let Some(declaration) = declaration {
                declarations.push(declaration);
            } else {
                self.synchronize_top_level();
            }
        }

        let trailing_trivia = self.current().leading_trivia.clone();
        ParseOutput {
            document: Some(Document {
                module,
                declarations,
                trailing_trivia,
                span: Span::new(0, self.source_file.source().len()),
            }),
            diagnostics: self.diagnostics,
        }
    }

    fn parse_required_module(&mut self) -> Option<ModuleDeclaration> {
        if !self.at(TokenKind::Module) {
            self.emit(
                "JAPI-P002",
                "missing module declaration",
                self.current().span,
                "a JOI API file must begin with `module <name>;`",
            );
            return None;
        }

        self.parse_module()
    }

    fn parse_module(&mut self) -> Option<ModuleDeclaration> {
        let keyword = self.advance();
        let name = self.parse_identifier("expected module name")?;
        let semicolon = self.expect(
            TokenKind::Semicolon,
            "expected `;` after module declaration",
        )?;
        Some(ModuleDeclaration {
            name,
            leading_trivia: keyword.leading_trivia,
            span: Span::new(keyword.span.start, semicolon.span.end),
        })
    }

    fn parse_model(&mut self) -> Option<ModelDeclaration> {
        let keyword = self.advance();
        let name = self.parse_identifier("expected model name")?;
        self.expect(TokenKind::LeftBrace, "expected `{` after model name")?;
        let mut fields = Vec::new();

        while !self.at_any(&[TokenKind::RightBrace, TokenKind::EndOfFile]) {
            if let Some(field) = self.parse_field() {
                fields.push(field);
            } else {
                self.synchronize_member();
            }
        }

        let right_brace = self.expect(TokenKind::RightBrace, "expected `}` after model fields")?;
        Some(ModelDeclaration {
            name,
            fields,
            leading_trivia: keyword.leading_trivia,
            span: Span::new(keyword.span.start, right_brace.span.end),
        })
    }

    fn parse_field(&mut self) -> Option<Field> {
        let leading_trivia = self.current().leading_trivia.clone();
        let name = self.parse_identifier("expected field name")?;
        self.expect(TokenKind::Colon, "expected `:` after field name")?;
        let ty = self.parse_type_expression()?;
        let semicolon = self.expect(TokenKind::Semicolon, "expected `;` after field")?;
        Some(Field {
            span: Span::new(name.span.start, semicolon.span.end),
            name,
            ty,
            leading_trivia,
        })
    }

    fn parse_operation(&mut self) -> Option<OperationDeclaration> {
        let keyword = self.advance();
        let operation_kind = match keyword.kind {
            TokenKind::Command => OperationKind::Command,
            TokenKind::Query => OperationKind::Query,
            _ => unreachable!("parse_operation starts on an operation keyword"),
        };
        let name = self.parse_identifier("expected operation name")?;
        self.expect(TokenKind::LeftParen, "expected `(` after operation name")?;
        let parameters = self.parse_parameters();
        let right_parenthesis = self.expect(
            TokenKind::RightParen,
            "expected `)` after operation parameters",
        )?;
        let returns = if self.at(TokenKind::Returns) {
            Some(self.parse_return_record()?)
        } else {
            None
        };
        let end = returns
            .as_ref()
            .map(|record| record.span.end)
            .unwrap_or(right_parenthesis.span.end);

        Some(OperationDeclaration {
            kind: Spanned::new(operation_kind, keyword.span),
            name,
            parameters,
            returns,
            leading_trivia: keyword.leading_trivia,
            span: Span::new(keyword.span.start, end),
        })
    }

    fn parse_parameters(&mut self) -> Vec<Parameter> {
        let mut parameters = Vec::new();
        if self.at(TokenKind::RightParen) {
            return parameters;
        }

        while !self.at_any(&[TokenKind::RightParen, TokenKind::EndOfFile]) {
            let leading_trivia = self.current().leading_trivia.clone();
            let parameter = self
                .parse_identifier("expected parameter name")
                .and_then(|name| {
                    self.expect(TokenKind::Colon, "expected `:` after parameter name")?;
                    let ty = self.parse_type_expression()?;
                    let span = Span::new(name.span.start, ty.span.end);
                    Some(Parameter {
                        name,
                        ty,
                        leading_trivia,
                        span,
                    })
                });

            if let Some(parameter) = parameter {
                parameters.push(parameter);
            } else {
                self.synchronize_parameter();
            }

            if self.at(TokenKind::RightParen) || self.at(TokenKind::EndOfFile) {
                break;
            }

            if self.at(TokenKind::Comma) {
                self.advance();
                continue;
            }

            self.emit(
                "JAPI-P001",
                "expected `,` between parameters",
                self.current().span,
                "add `,` here",
            );
            self.synchronize_parameter();
            if self.at(TokenKind::Comma) {
                self.advance();
            }
        }

        parameters
    }

    fn parse_return_record(&mut self) -> Option<ReturnRecord> {
        let returns_keyword = self.advance();
        self.expect(TokenKind::LeftBrace, "expected `{` after `returns`")?;
        let mut fields = Vec::new();

        while !self.at_any(&[TokenKind::RightBrace, TokenKind::EndOfFile]) {
            if let Some(field) = self.parse_field() {
                fields.push(field);
            } else {
                self.synchronize_member();
            }
        }

        let right_brace = self.expect(TokenKind::RightBrace, "expected `}` after return fields")?;
        Some(ReturnRecord {
            fields,
            span: Span::new(returns_keyword.span.start, right_brace.span.end),
        })
    }

    fn parse_type_expression(&mut self) -> Option<TypeExpression> {
        let constructor = self.parse_identifier("expected type name")?;
        if !self.at(TokenKind::LessThan) {
            return Some(TypeExpression {
                span: constructor.span,
                kind: TypeExpressionKind::Named(constructor),
            });
        }

        self.advance();
        let mut arguments = Vec::new();
        if self.at(TokenKind::GreaterThan) {
            self.emit(
                "JAPI-P005",
                "generic type requires an argument",
                self.current().span,
                "add a type or string argument",
            );
            return None;
        }

        loop {
            let argument = if self.at(TokenKind::StringLiteral) {
                TypeArgument::String(self.parse_string_literal())
            } else if self.at(TokenKind::Identifier) {
                TypeArgument::Type(self.parse_type_expression()?)
            } else {
                self.emit(
                    "JAPI-P005",
                    "invalid type argument",
                    self.current().span,
                    "expected a type or string literal",
                );
                return None;
            };
            arguments.push(argument);

            if !self.at(TokenKind::Comma) {
                break;
            }
            self.advance();
            if self.at(TokenKind::GreaterThan) {
                self.emit(
                    "JAPI-P005",
                    "trailing comma in generic arguments",
                    self.current().span,
                    "add another argument or remove the comma",
                );
                return None;
            }
        }

        let greater_than = self.expect(
            TokenKind::GreaterThan,
            "expected `>` after generic type arguments",
        )?;
        Some(TypeExpression {
            span: Span::new(constructor.span.start, greater_than.span.end),
            kind: TypeExpressionKind::Generic {
                constructor,
                arguments,
            },
        })
    }

    fn parse_identifier(&mut self, message: &'static str) -> Option<Identifier> {
        let token = self.expect(TokenKind::Identifier, message)?;
        Some(Identifier::new(self.text(token.span), token.span))
    }

    fn parse_string_literal(&mut self) -> StringLiteral {
        let token = self.advance();
        let value_span = Span::new(token.span.start + 1, token.span.end - 1);
        StringLiteral::new(self.text(value_span), token.span)
    }

    fn expect(&mut self, kind: TokenKind, message: &'static str) -> Option<Token> {
        if self.at(kind) {
            return Some(self.advance());
        }

        self.emit(
            "JAPI-P001",
            message,
            self.current().span,
            token_expectation(kind),
        );
        None
    }

    fn report_duplicate_module(&mut self, first_module_span: Span) {
        let duplicate_span = self.current().span;
        let diagnostic = Diagnostic::error(
            "JAPI-P003",
            self.source_file.path(),
            "duplicate module declaration",
            duplicate_span,
            "only one module declaration is allowed",
        )
        .with_secondary(first_module_span, "the module was first declared here");
        self.diagnostics.push(diagnostic);
    }

    fn consume_duplicate_module(&mut self) {
        self.advance();
        while !self.at_any(&[TokenKind::Semicolon, TokenKind::EndOfFile]) {
            self.advance();
        }
        if self.at(TokenKind::Semicolon) {
            self.advance();
        }
    }

    fn skip_unexpected_tokens(&mut self) {
        while self.at(TokenKind::Unexpected) {
            self.advance();
        }
    }

    fn synchronize_top_level(&mut self) {
        while !self.at_any(&[
            TokenKind::Module,
            TokenKind::Model,
            TokenKind::Command,
            TokenKind::Query,
            TokenKind::EndOfFile,
        ]) {
            self.advance();
        }
    }

    fn synchronize_member(&mut self) {
        while !self.at_any(&[
            TokenKind::Semicolon,
            TokenKind::RightBrace,
            TokenKind::EndOfFile,
        ]) {
            self.advance();
        }
        if self.at(TokenKind::Semicolon) {
            self.advance();
        }
    }

    fn synchronize_parameter(&mut self) {
        while !self.at_any(&[
            TokenKind::Comma,
            TokenKind::RightParen,
            TokenKind::EndOfFile,
        ]) {
            self.advance();
        }
    }

    fn emit(&mut self, code: &'static str, summary: &'static str, span: Span, label: &'static str) {
        self.diagnostics.push(Diagnostic::error(
            code,
            self.source_file.path(),
            summary,
            span,
            label,
        ));
    }

    fn text(&self, span: Span) -> &str {
        self.source_file
            .span_text(span)
            .expect("lexer spans must lie on UTF-8 boundaries")
    }

    fn current(&self) -> &Token {
        &self.tokens[self.position]
    }

    fn at(&self, kind: TokenKind) -> bool {
        self.current().kind == kind
    }

    fn at_any(&self, kinds: &[TokenKind]) -> bool {
        kinds.contains(&self.current().kind)
    }

    fn advance(&mut self) -> Token {
        let token = self.current().clone();
        if token.kind != TokenKind::EndOfFile {
            self.position += 1;
        }
        token
    }
}

fn token_expectation(kind: TokenKind) -> &'static str {
    match kind {
        TokenKind::Identifier => "an identifier is required here",
        TokenKind::Colon => "add `:` here",
        TokenKind::Comma => "add `,` here",
        TokenKind::Semicolon => "add `;` here",
        TokenKind::GreaterThan => "add `>` here",
        TokenKind::LeftParen => "add `(` here",
        TokenKind::RightParen => "add `)` here",
        TokenKind::LeftBrace => "add `{` here",
        TokenKind::RightBrace => "add `}` here",
        _ => "expected syntax is missing here",
    }
}

#[cfg(test)]
mod tests {
    use super::parse;
    use crate::{
        ast::{Declaration, OperationKind, TypeArgument, TypeExpressionKind},
        source_file::SourceFile,
        span::Span,
    };

    #[test]
    fn parses_nested_generic_types_and_string_arguments() {
        let source = SourceFile::new(
            "test.joi-api",
            "module t; command update(items: list<partialExcept<\"id\", Ticket>>,)",
        );
        let output = parse(&source);

        assert!(output.diagnostics.is_empty());
        let document = output.document.unwrap();
        let Declaration::Operation(operation) = &document.declarations[0] else {
            panic!("expected operation");
        };
        assert_eq!(operation.kind.value, OperationKind::Command);
        let TypeExpressionKind::Generic { arguments, .. } = &operation.parameters[0].ty.kind else {
            panic!("expected list type");
        };
        let TypeArgument::Type(inner) = &arguments[0] else {
            panic!("expected nested type");
        };
        let TypeExpressionKind::Generic { arguments, .. } = &inner.kind else {
            panic!("expected partial type");
        };
        let TypeArgument::String(field_name) = &arguments[0] else {
            panic!("expected string argument");
        };
        assert_eq!(field_name.value, "id");
        assert_eq!(source.span_text(field_name.span), Some("\"id\""));
    }

    #[test]
    fn missing_module_prevents_ast_construction() {
        let source = SourceFile::new("test.joi-api", "model Ticket {}");
        let output = parse(&source);

        assert!(output.document.is_none());
        assert_eq!(output.diagnostics[0].code, "JAPI-P002");
        assert_eq!(output.diagnostics[0].primary.span, Span::new(0, 5));
        assert_eq!(output.diagnostics[0].source_path, source.path());
    }

    #[test]
    fn recovers_at_member_and_declaration_boundaries() {
        let source = SourceFile::new(
            "test.joi-api",
            "module t; model Bad { broken string; good: string; } query all()",
        );
        let output = parse(&source);
        let document = output.document.unwrap();

        assert_eq!(output.diagnostics.len(), 1);
        assert_eq!(output.diagnostics[0].code, "JAPI-P001");
        assert_eq!(document.declarations.len(), 2);
        let Declaration::Model(model) = &document.declarations[0] else {
            panic!("expected model");
        };
        assert_eq!(model.fields.len(), 1);
        assert_eq!(model.fields[0].name.text, "good");
    }

    #[test]
    fn duplicate_module_points_to_both_declarations() {
        let source = SourceFile::new("test.joi-api", "module a; module b; model X {}");
        let output = parse(&source);

        assert_eq!(output.diagnostics.len(), 1);
        assert_eq!(output.diagnostics[0].code, "JAPI-P003");
        assert_eq!(output.diagnostics[0].secondary.len(), 1);
        assert_eq!(output.document.unwrap().declarations.len(), 1);
    }

    #[test]
    fn recovers_a_later_parameter_after_a_malformed_one() {
        let source = SourceFile::new(
            "test.joi-api",
            "module t; query get(broken string, id: id<Ticket>,) returns { value: string; }",
        );
        let output = parse(&source);
        let document = output.document.unwrap();

        assert_eq!(output.diagnostics.len(), 1);
        assert_eq!(
            output.diagnostics[0].summary,
            "expected `:` after parameter name"
        );
        let Declaration::Operation(operation) = &document.declarations[0] else {
            panic!("expected operation");
        };
        assert_eq!(operation.parameters.len(), 1);
        assert_eq!(operation.parameters[0].name.text, "id");
        assert!(operation.returns.is_some());
    }

    #[test]
    fn eof_diagnostic_uses_an_empty_end_span() {
        let source = SourceFile::new("test.joi-api", "module t; model Ticket {");
        let output = parse(&source);

        assert_eq!(output.diagnostics.len(), 1);
        assert_eq!(
            output.diagnostics[0].summary,
            "expected `}` after model fields"
        );
        assert_eq!(output.diagnostics[0].primary.span, source.eof_span());
    }

    #[test]
    fn empty_input_reports_missing_module_at_eof() {
        let source = SourceFile::new("empty.joi-api", "");
        let output = parse(&source);

        assert!(output.document.is_none());
        assert_eq!(output.diagnostics[0].code, "JAPI-P002");
        assert_eq!(output.diagnostics[0].primary.span, Span::new(0, 0));
    }

    #[test]
    fn rejects_trailing_comma_in_generic_arguments() {
        let source = SourceFile::new(
            "test.joi-api",
            "module t; model Ticket { id: id<Ticket,>; }",
        );
        let output = parse(&source);

        assert_eq!(output.diagnostics.len(), 1);
        assert_eq!(output.diagnostics[0].code, "JAPI-P005");
        assert_eq!(
            output.diagnostics[0].summary,
            "trailing comma in generic arguments"
        );
    }
}
