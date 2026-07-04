use std::collections::{HashMap, HashSet};

use crate::lexer::{Lexer, Token, TokenKind};
use crate::parser::ParseError;
use crate::source::SourceSpan;
use crate::template::{
    FragmentDefinition, FragmentParameter, FragmentRender, Identifier, NamedArgument,
    ParameterType, Substitution, SubstitutionPath, Template, TemplateSegment, TextSegment,
};

/// Parses and validates template source text into an AST.
pub fn parse_template(source: &str) -> Result<Template<'_>, ParseError> {
    Parser::new(source)?.parse_template()
}

#[derive(Debug, Clone)]
struct Parser<'a> {
    lexer: Lexer<'a>,
    current_token: Token<'a>,
    source_len: usize,
}

impl<'a> Parser<'a> {
    fn new(source: &'a str) -> Result<Self, ParseError> {
        let mut lexer = Lexer::new(source);
        let current_token = lexer.next_token()?;
        Ok(Self {
            lexer,
            current_token,
            source_len: source.len(),
        })
    }

    fn parse_template(&mut self) -> Result<Template<'a>, ParseError> {
        let mut segments = Vec::new();
        let mut fragments = Vec::new();

        while !matches!(self.current_token.kind, TokenKind::EndOfFile) {
            match self.current_token.kind {
                TokenKind::Text(_) => segments.push(TemplateSegment::Text(self.parse_text()?)),
                TokenKind::LeftBrace => {
                    let left = self.bump()?;
                    if matches!(self.current_token.kind, TokenKind::At) {
                        self.bump()?;
                        let directive = self.parse_identifier()?;
                        match directive.name.as_ref() {
                            "fragment" => fragments.push(self.parse_fragment(left, directive)?),
                            "render" => segments.push(TemplateSegment::FragmentRender(
                                self.parse_render(left, directive)?,
                            )),
                            "end" => {
                                return Err(ParseError::UnexpectedEnd {
                                    span: directive.span,
                                });
                            }
                            _ => {
                                return Err(ParseError::UnknownDirective {
                                    span: directive.span,
                                });
                            }
                        }
                    } else {
                        segments.push(TemplateSegment::Substitution(
                            self.parse_substitution_after_left(left)?,
                        ));
                    }
                }
                _ => {
                    return Err(ParseError::ExpectedClosingBrace {
                        span: self.current_token.span,
                    });
                }
            }
        }

        let template = Template::with_fragments(
            SourceSpan::from_range(0, self.source_len),
            segments,
            fragments,
        );
        validate_template(&template)?;
        Ok(template)
    }

    fn parse_fragment(
        &mut self,
        left: Token<'a>,
        _directive: Identifier<'a>,
    ) -> Result<FragmentDefinition<'a>, ParseError> {
        let name = self.parse_identifier()?;
        self.expect(|kind| matches!(kind, TokenKind::LeftParenthesis), "`(`")?;
        let parameters = self.parse_parameters()?;
        self.expect(|kind| matches!(kind, TokenKind::RightParenthesis), "`)`")?;
        self.expect(|kind| matches!(kind, TokenKind::RightBrace), "`}`")?;

        let mut body = Vec::new();
        loop {
            match self.current_token.kind {
                TokenKind::EndOfFile => {
                    return Err(ParseError::MissingFragmentEnd { span: name.span });
                }
                TokenKind::Text(_) => body.push(TemplateSegment::Text(self.parse_text()?)),
                TokenKind::LeftBrace => {
                    let body_left = self.bump()?;
                    if !matches!(self.current_token.kind, TokenKind::At) {
                        body.push(TemplateSegment::Substitution(
                            self.parse_substitution_after_left(body_left)?,
                        ));
                        continue;
                    }
                    self.bump()?;
                    let directive = self.parse_identifier()?;
                    match directive.name.as_ref() {
                        "render" => body.push(TemplateSegment::FragmentRender(
                            self.parse_render(body_left, directive)?,
                        )),
                        "fragment" => {
                            return Err(ParseError::NestedFragment {
                                span: directive.span,
                            });
                        }
                        "end" => {
                            let right =
                                self.expect(|kind| matches!(kind, TokenKind::RightBrace), "`}`")?;
                            return Ok(FragmentDefinition {
                                span: SourceSpan::cover(left.span, right.span),
                                name,
                                parameters,
                                body,
                            });
                        }
                        _ => {
                            return Err(ParseError::UnknownDirective {
                                span: directive.span,
                            });
                        }
                    }
                }
                _ => {
                    return Err(ParseError::ExpectedClosingBrace {
                        span: self.current_token.span,
                    });
                }
            }
        }
    }

    fn parse_parameters(&mut self) -> Result<Vec<FragmentParameter<'a>>, ParseError> {
        let mut parameters = Vec::new();
        if matches!(self.current_token.kind, TokenKind::RightParenthesis) {
            return Ok(parameters);
        }
        loop {
            let name = self.parse_identifier()?;
            self.expect(|kind| matches!(kind, TokenKind::Colon), "`:`")?;
            let type_name = self.parse_identifier()?;
            let parameter_type = match type_name.name.as_ref() {
                "string" => ParameterType::String,
                "boolean" => ParameterType::Boolean,
                "integer" => ParameterType::Integer,
                "float" => ParameterType::Float,
                "struct" => ParameterType::Struct,
                "list" => ParameterType::List,
                _ => {
                    return Err(ParseError::UnsupportedParameterType {
                        span: type_name.span,
                    });
                }
            };
            parameters.push(FragmentParameter {
                span: SourceSpan::cover(name.span, type_name.span),
                name,
                parameter_type,
            });
            if !matches!(self.current_token.kind, TokenKind::Comma) {
                break;
            }
            self.bump()?;
        }
        Ok(parameters)
    }

    fn parse_render(
        &mut self,
        left: Token<'a>,
        _directive: Identifier<'a>,
    ) -> Result<FragmentRender<'a>, ParseError> {
        let name = self.parse_identifier()?;
        self.expect(|kind| matches!(kind, TokenKind::LeftParenthesis), "`(`")?;
        let mut arguments = Vec::new();
        if !matches!(self.current_token.kind, TokenKind::RightParenthesis) {
            loop {
                let argument_name = self.parse_identifier()?;
                self.expect(|kind| matches!(kind, TokenKind::Equals), "`=`")?;
                let value_path = self.parse_path()?;
                arguments.push(NamedArgument {
                    span: SourceSpan::cover(argument_name.span, value_path.span),
                    name: argument_name,
                    value_path,
                });
                if !matches!(self.current_token.kind, TokenKind::Comma) {
                    break;
                }
                self.bump()?;
            }
        }
        self.expect(|kind| matches!(kind, TokenKind::RightParenthesis), "`)`")?;
        let right = self.expect(|kind| matches!(kind, TokenKind::RightBrace), "`}`")?;
        Ok(FragmentRender {
            span: SourceSpan::cover(left.span, right.span),
            name,
            arguments,
        })
    }

    fn parse_substitution_after_left(
        &mut self,
        left: Token<'a>,
    ) -> Result<Substitution<'a>, ParseError> {
        if matches!(self.current_token.kind, TokenKind::RightBrace) {
            return Err(ParseError::EmptySubstitution {
                span: SourceSpan::cover(left.span, self.current_token.span),
            });
        }
        let path = self.parse_path()?;
        let right = self.expect(|kind| matches!(kind, TokenKind::RightBrace), "`}`")?;
        Ok(Substitution::new(
            SourceSpan::cover(left.span, right.span),
            path,
        ))
    }

    fn parse_path(&mut self) -> Result<SubstitutionPath<'a>, ParseError> {
        let mut segments = vec![self.parse_identifier()?];
        while matches!(self.current_token.kind, TokenKind::Dot) {
            let dot = self.bump()?;
            if !matches!(self.current_token.kind, TokenKind::Identifier(_)) {
                return Err(ParseError::MalformedPath {
                    span: SourceSpan::cover(dot.span, self.current_token.span),
                });
            }
            segments.push(self.parse_identifier()?);
        }
        let span = SourceSpan::cover(segments[0].span, segments.last().unwrap().span);
        Ok(SubstitutionPath::new(span, segments))
    }

    fn parse_identifier(&mut self) -> Result<Identifier<'a>, ParseError> {
        let token = self.bump()?;
        match token.kind {
            TokenKind::Identifier(name) => Ok(Identifier::new(token.span, name)),
            _ => Err(ParseError::UnexpectedToken {
                span: token.span,
                expected: "identifier",
            }),
        }
    }

    fn parse_text(&mut self) -> Result<TextSegment<'a>, ParseError> {
        let token = self.bump()?;
        match token.kind {
            TokenKind::Text(text) => Ok(TextSegment::new(token.span, text)),
            _ => unreachable!(),
        }
    }

    fn expect(
        &mut self,
        predicate: impl FnOnce(&TokenKind<'a>) -> bool,
        expected: &'static str,
    ) -> Result<Token<'a>, ParseError> {
        if !predicate(&self.current_token.kind) {
            return Err(ParseError::UnexpectedToken {
                span: self.current_token.span,
                expected,
            });
        }
        self.bump()
    }

    fn bump(&mut self) -> Result<Token<'a>, ParseError> {
        let next = self.lexer.next_token()?;
        Ok(std::mem::replace(&mut self.current_token, next))
    }
}

fn validate_template(template: &Template<'_>) -> Result<(), ParseError> {
    let mut registry = HashMap::new();
    for (index, fragment) in template.fragments.iter().enumerate() {
        if registry
            .insert(fragment.name.name.as_ref(), index)
            .is_some()
        {
            return Err(ParseError::DuplicateFragment {
                span: fragment.name.span,
            });
        }
        let mut parameters = HashSet::new();
        for parameter in &fragment.parameters {
            if !parameters.insert(parameter.name.name.as_ref()) {
                return Err(ParseError::DuplicateParameter {
                    span: parameter.name.span,
                });
            }
        }
    }

    validate_segments(&template.segments, template, &registry)?;
    for fragment in &template.fragments {
        validate_segments(&fragment.body, template, &registry)?;
    }

    let mut states = vec![0_u8; template.fragments.len()];
    for index in 0..template.fragments.len() {
        validate_no_recursion(index, template, &registry, &mut states)?;
    }
    Ok(())
}

fn validate_segments(
    segments: &[TemplateSegment<'_>],
    template: &Template<'_>,
    registry: &HashMap<&str, usize>,
) -> Result<(), ParseError> {
    for segment in segments {
        let TemplateSegment::FragmentRender(render) = segment else {
            continue;
        };
        let Some(index) = registry.get(render.name.name.as_ref()) else {
            return Err(ParseError::UnknownFragment {
                span: render.name.span,
            });
        };
        let fragment = &template.fragments[*index];
        let mut arguments = HashSet::new();
        for argument in &render.arguments {
            if !arguments.insert(argument.name.name.as_ref()) {
                return Err(ParseError::DuplicateArgument {
                    span: argument.name.span,
                });
            }
            if !fragment
                .parameters
                .iter()
                .any(|parameter| parameter.name.name == argument.name.name)
            {
                return Err(ParseError::UnknownArgument {
                    span: argument.name.span,
                });
            }
        }
        for parameter in &fragment.parameters {
            if !arguments.contains(parameter.name.name.as_ref()) {
                return Err(ParseError::MissingArgument { span: render.span });
            }
        }
    }
    Ok(())
}

fn validate_no_recursion(
    index: usize,
    template: &Template<'_>,
    registry: &HashMap<&str, usize>,
    states: &mut [u8],
) -> Result<(), ParseError> {
    if states[index] == 2 {
        return Ok(());
    }
    states[index] = 1;
    for segment in &template.fragments[index].body {
        let TemplateSegment::FragmentRender(render) = segment else {
            continue;
        };
        let target = registry[render.name.name.as_ref()];
        if states[target] == 1 {
            return Err(ParseError::RecursiveFragment { span: render.span });
        }
        validate_no_recursion(target, template, registry, states)?;
    }
    states[index] = 2;
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::parser::{ParseError, parse_template};
    use crate::source::SourceSpan;
    use crate::template::{ParameterType, TemplateSegment};

    #[test]
    fn parses_substitutions_without_fragments() {
        let template = parse_template("Hello {user.name}!").unwrap();
        assert_eq!(template.fragments.len(), 0);
        assert_eq!(template.segments.len(), 3);
    }

    #[test]
    fn parses_named_typed_fragments_with_exact_spans() {
        let source =
            "{@render item(value = model.name)}{@fragment item(value: string)}{value}{@end}";
        let template = parse_template(source).unwrap();
        assert_eq!(template.fragments.len(), 1);
        assert_eq!(template.fragments[0].span, SourceSpan::from_range(34, 78));
        assert_eq!(
            template.fragments[0].parameters[0].parameter_type,
            ParameterType::String
        );
        assert!(matches!(
            template.segments[0],
            TemplateSegment::FragmentRender(_)
        ));
    }

    #[test]
    fn rejects_duplicate_parameters() {
        let error =
            parse_template("{@fragment item(value: string, value: string)}{@end}").unwrap_err();
        assert!(matches!(error, ParseError::DuplicateParameter { .. }));
    }

    #[test]
    fn rejects_missing_arguments() {
        let error =
            parse_template("{@fragment item(value: string)}{@end}{@render item()}").unwrap_err();
        assert!(matches!(error, ParseError::MissingArgument { .. }));
    }

    #[test]
    fn rejects_direct_and_indirect_recursion() {
        let direct = parse_template("{@fragment a()}{@render a()}{@end}").unwrap_err();
        assert!(matches!(direct, ParseError::RecursiveFragment { .. }));

        let indirect =
            parse_template("{@fragment a()}{@render b()}{@end}{@fragment b()}{@render a()}{@end}")
                .unwrap_err();
        assert!(matches!(indirect, ParseError::RecursiveFragment { .. }));
    }

    #[test]
    fn rejects_nested_fragments_and_missing_end() {
        assert!(matches!(
            parse_template("{@fragment a()}{@fragment b()}{@end}{@end}"),
            Err(ParseError::NestedFragment { .. })
        ));
        assert!(matches!(
            parse_template("{@fragment a()}text"),
            Err(ParseError::MissingFragmentEnd { .. })
        ));
    }

    #[test]
    fn validates_fragment_signatures_and_render_arguments() {
        type ErrorPredicate = fn(&ParseError) -> bool;
        let cases: &[(&str, ErrorPredicate)] = &[
            ("{@fragment a()}{@end}{@fragment a()}{@end}", |error| {
                matches!(error, ParseError::DuplicateFragment { .. })
            }),
            ("{@render missing()}", |error| {
                matches!(error, ParseError::UnknownFragment { .. })
            }),
            (
                "{@fragment a(value: string)}{@end}{@render a(other = root)}",
                |error| matches!(error, ParseError::UnknownArgument { .. }),
            ),
            (
                "{@fragment a(value: string)}{@end}{@render a(value = root, value = root)}",
                |error| matches!(error, ParseError::DuplicateArgument { .. }),
            ),
            ("{@fragment a(value: unknown)}{@end}", |error| {
                matches!(error, ParseError::UnsupportedParameterType { .. })
            }),
        ];

        for (source, predicate) in cases {
            let error = parse_template(source).unwrap_err();
            assert!(
                predicate(&error),
                "unexpected error for `{source}`: {error:?}"
            );
        }
    }
}
