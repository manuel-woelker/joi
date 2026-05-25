use crate::lexer::{Lexer, Token, TokenKind};
use crate::parser::ParseError;
use crate::source::SourceSpan;
use crate::template::{
    Identifier, Substitution, SubstitutionPath, Template, TemplateSegment, TextSegment,
};

/// Parses template source text into an AST.
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

        while !matches!(self.current_token.kind, TokenKind::EndOfFile) {
            segments.push(match self.current_token.kind.clone() {
                TokenKind::Text(_) => TemplateSegment::Text(self.parse_text_segment()?),
                TokenKind::LeftBrace => TemplateSegment::Substitution(self.parse_substitution()?),
                _ => {
                    return Err(ParseError::ExpectedClosingBrace {
                        span: self.current_token.span,
                    });
                }
            });
        }

        Ok(Template::new(
            SourceSpan::from_range(0, self.source_len),
            segments,
        ))
    }

    fn parse_text_segment(&mut self) -> Result<TextSegment<'a>, ParseError> {
        let token = self.bump()?;

        match token.kind {
            TokenKind::Text(text) => Ok(TextSegment::new(token.span, text)),
            _ => unreachable!("text parsing should only be called for text tokens"),
        }
    }

    fn parse_substitution(&mut self) -> Result<Substitution<'a>, ParseError> {
        let left_brace = self.bump()?;
        let path = match self.current_token.kind {
            TokenKind::RightBrace => {
                return Err(ParseError::EmptySubstitution {
                    span: SourceSpan::cover(left_brace.span, self.current_token.span),
                });
            }
            _ => self.parse_substitution_path()?,
        };

        match self.current_token.kind {
            TokenKind::RightBrace => {
                let right_brace = self.bump()?;
                Ok(Substitution::new(
                    SourceSpan::cover(left_brace.span, right_brace.span),
                    path,
                ))
            }
            _ => Err(ParseError::ExpectedClosingBrace {
                span: self.current_token.span,
            }),
        }
    }

    fn parse_substitution_path(&mut self) -> Result<SubstitutionPath<'a>, ParseError> {
        let mut segments = vec![self.parse_identifier()?];

        while matches!(self.current_token.kind, TokenKind::Dot) {
            let dot = self.bump()?;

            if !matches!(self.current_token.kind, TokenKind::Identifier(_)) {
                let span = SourceSpan::cover(dot.span, self.current_token.span);
                return Err(ParseError::MalformedPath { span });
            }

            segments.push(self.parse_identifier()?);
        }

        let span = SourceSpan::cover(
            segments.first().unwrap().span,
            segments.last().unwrap().span,
        );
        Ok(SubstitutionPath::new(span, segments))
    }

    fn parse_identifier(&mut self) -> Result<Identifier<'a>, ParseError> {
        let token = self.bump()?;

        match token.kind {
            TokenKind::Identifier(name) => Ok(Identifier::new(token.span, name)),
            _ => Err(ParseError::MalformedPath { span: token.span }),
        }
    }

    fn bump(&mut self) -> Result<Token<'a>, ParseError> {
        let next_token = self.lexer.next_token()?;
        Ok(std::mem::replace(&mut self.current_token, next_token))
    }
}

#[cfg(test)]
mod tests {
    use std::borrow::Cow;

    use crate::lexer::LexerError;
    use crate::parser::{ParseError, parse_template};
    use crate::source::SourceSpan;
    use crate::template::{
        Identifier, Substitution, SubstitutionPath, Template, TemplateSegment, TextSegment,
    };

    #[test]
    fn parses_plain_text_templates() {
        assert_eq!(
            parse_template("Hello"),
            Ok(Template::new(
                SourceSpan::from_range(0, 5),
                vec![TemplateSegment::Text(TextSegment::new(
                    SourceSpan::from_range(0, 5),
                    Cow::Borrowed("Hello"),
                ))],
            ))
        );
    }

    #[test]
    fn parses_templates_with_multiple_substitutions_and_exact_spans() {
        assert_eq!(
            parse_template("Hello {user.name}! {greeting}"),
            Ok(Template::new(
                SourceSpan::from_range(0, 29),
                vec![
                    TemplateSegment::Text(TextSegment::new(
                        SourceSpan::from_range(0, 6),
                        Cow::Borrowed("Hello "),
                    )),
                    TemplateSegment::Substitution(Substitution::new(
                        SourceSpan::from_range(6, 17),
                        SubstitutionPath::new(
                            SourceSpan::from_range(7, 16),
                            vec![
                                Identifier::new(
                                    SourceSpan::from_range(7, 11),
                                    Cow::Borrowed("user"),
                                ),
                                Identifier::new(
                                    SourceSpan::from_range(12, 16),
                                    Cow::Borrowed("name"),
                                ),
                            ],
                        ),
                    )),
                    TemplateSegment::Text(TextSegment::new(
                        SourceSpan::from_range(17, 19),
                        Cow::Borrowed("! "),
                    )),
                    TemplateSegment::Substitution(Substitution::new(
                        SourceSpan::from_range(19, 29),
                        SubstitutionPath::new(
                            SourceSpan::from_range(20, 28),
                            vec![Identifier::new(
                                SourceSpan::from_range(20, 28),
                                Cow::Borrowed("greeting"),
                            )],
                        ),
                    )),
                ],
            ))
        );
    }

    #[test]
    fn rejects_empty_substitutions() {
        assert_eq!(
            parse_template("{}"),
            Err(ParseError::EmptySubstitution {
                span: SourceSpan::from_range(0, 2),
            })
        );
    }

    #[test]
    fn rejects_malformed_paths() {
        assert_eq!(
            parse_template("{user.}"),
            Err(ParseError::MalformedPath {
                span: SourceSpan::from_range(5, 7),
            })
        );
    }

    #[test]
    fn surfaces_lexer_errors_through_the_parser_api() {
        assert_eq!(
            parse_template("oops }"),
            Err(ParseError::Lexer(LexerError::UnexpectedClosingBrace {
                span: SourceSpan::from_range(5, 6),
            }))
        );
    }
}
