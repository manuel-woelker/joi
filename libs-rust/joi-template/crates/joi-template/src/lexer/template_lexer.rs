use std::borrow::Cow;

use crate::lexer::{LexerError, LexerState, Token, TokenKind};
use crate::source::SourceSpan;

/// A lexer for template source text.
#[derive(Debug, Clone)]
pub struct Lexer<'a> {
    source: &'a str,
    offset: usize,
    state: LexerState,
}

impl<'a> Lexer<'a> {
    /// Creates a new lexer for the given source text.
    #[must_use]
    pub fn new(source: &'a str) -> Self {
        Self {
            source,
            offset: 0,
            state: LexerState::Text,
        }
    }

    /// Produces the next token from the current lexer state.
    pub fn next_token(&mut self) -> Result<Token<'a>, LexerError> {
        match self.state {
            LexerState::Text => self.lex_text_mode(),
            LexerState::Substitution => self.lex_substitution_mode(),
        }
    }

    fn lex_text_mode(&mut self) -> Result<Token<'a>, LexerError> {
        if self.offset >= self.source.len() {
            return Ok(Token::new(
                SourceSpan::from_range(self.offset, self.offset),
                TokenKind::EndOfFile,
            ));
        }

        match self.current_char() {
            Some('{') => {
                let start = self.offset;
                self.consume_char();
                if self.current_char() == Some('{') {
                    self.consume_char();
                    return Ok(Token::new(
                        SourceSpan::from_range(start, self.offset),
                        TokenKind::Text(Cow::Owned("{".to_owned())),
                    ));
                }
                self.state = LexerState::Substitution;
                Ok(Token::new(
                    SourceSpan::from_range(start, self.offset),
                    TokenKind::LeftBrace,
                ))
            }
            Some('}') => {
                let start = self.offset;
                self.consume_char();
                if self.current_char() == Some('}') {
                    self.consume_char();
                    Ok(Token::new(
                        SourceSpan::from_range(start, self.offset),
                        TokenKind::Text(Cow::Owned("}".to_owned())),
                    ))
                } else {
                    Err(LexerError::UnexpectedClosingBrace {
                        span: SourceSpan::from_range(start, self.offset),
                    })
                }
            }
            Some(_) => {
                let start = self.offset;

                while let Some(character) = self.current_char() {
                    if character == '{' || character == '}' {
                        break;
                    }

                    self.consume_char();
                }

                Ok(Token::new(
                    SourceSpan::from_range(start, self.offset),
                    TokenKind::Text(Cow::Borrowed(&self.source[start..self.offset])),
                ))
            }
            None => Ok(Token::new(
                SourceSpan::from_range(self.offset, self.offset),
                TokenKind::EndOfFile,
            )),
        }
    }

    fn lex_substitution_mode(&mut self) -> Result<Token<'a>, LexerError> {
        self.skip_substitution_whitespace();

        if self.offset >= self.source.len() {
            return Err(LexerError::UnterminatedSubstitution {
                span: SourceSpan::from_range(self.offset, self.offset),
            });
        }

        match self.current_char() {
            Some('}') => {
                let start = self.offset;
                self.consume_char();
                self.state = LexerState::Text;
                Ok(Token::new(
                    SourceSpan::from_range(start, self.offset),
                    TokenKind::RightBrace,
                ))
            }
            Some('.') => {
                let start = self.offset;
                self.consume_char();
                Ok(Token::new(
                    SourceSpan::from_range(start, self.offset),
                    TokenKind::Dot,
                ))
            }
            Some('@' | ':' | '=' | ',' | '(' | ')') => {
                let start = self.offset;
                let character = self.current_char().unwrap();
                self.consume_char();
                let kind = match character {
                    '@' => TokenKind::At,
                    ':' => TokenKind::Colon,
                    '=' => TokenKind::Equals,
                    ',' => TokenKind::Comma,
                    '(' => TokenKind::LeftParenthesis,
                    ')' => TokenKind::RightParenthesis,
                    _ => unreachable!(),
                };
                Ok(Token::new(SourceSpan::from_range(start, self.offset), kind))
            }
            Some(character) if is_identifier_start(character) => {
                let start = self.offset;
                self.consume_char();

                while let Some(character) = self.current_char() {
                    if !is_identifier_continue(character) {
                        break;
                    }

                    self.consume_char();
                }

                Ok(Token::new(
                    SourceSpan::from_range(start, self.offset),
                    TokenKind::Identifier(Cow::Borrowed(&self.source[start..self.offset])),
                ))
            }
            Some(character) => Err(LexerError::InvalidCharacterInSubstitution {
                span: SourceSpan::from_range(self.offset, self.offset + character.len_utf8()),
                character,
            }),
            None => Err(LexerError::UnterminatedSubstitution {
                span: SourceSpan::from_range(self.offset, self.offset),
            }),
        }
    }

    fn current_char(&self) -> Option<char> {
        self.source[self.offset..].chars().next()
    }

    fn consume_char(&mut self) {
        if let Some(character) = self.current_char() {
            self.offset += character.len_utf8();
        }
    }

    fn skip_substitution_whitespace(&mut self) {
        while let Some(character) = self.current_char() {
            if !character.is_whitespace() {
                break;
            }

            self.consume_char();
        }
    }
}

fn is_identifier_start(character: char) -> bool {
    character == '_' || character.is_ascii_alphabetic()
}

fn is_identifier_continue(character: char) -> bool {
    character == '_' || character.is_ascii_alphanumeric()
}

#[cfg(test)]
mod tests {
    use std::borrow::Cow;

    use crate::lexer::{Lexer, LexerError, LexerState, Token, TokenKind};
    use crate::source::SourceSpan;

    #[test]
    fn lexes_text_and_substitution_tokens_with_explicit_state_transitions() {
        let mut lexer = Lexer::new("Hello {user.name}!");

        assert_eq!(
            lexer.next_token(),
            Ok(token(0, 6, TokenKind::Text("Hello ".into())))
        );
        assert_eq!(lexer.state, LexerState::Text);
        assert_eq!(lexer.next_token(), Ok(token(6, 7, TokenKind::LeftBrace)));
        assert_eq!(lexer.state, LexerState::Substitution);
        assert_eq!(
            lexer.next_token(),
            Ok(token(7, 11, TokenKind::Identifier("user".into())))
        );
        assert_eq!(lexer.next_token(), Ok(token(11, 12, TokenKind::Dot)));
        assert_eq!(
            lexer.next_token(),
            Ok(token(12, 16, TokenKind::Identifier("name".into())))
        );
        assert_eq!(lexer.next_token(), Ok(token(16, 17, TokenKind::RightBrace)));
        assert_eq!(lexer.state, LexerState::Text);
        assert_eq!(
            lexer.next_token(),
            Ok(token(17, 18, TokenKind::Text("!".into())))
        );
        assert_eq!(lexer.next_token(), Ok(token(18, 18, TokenKind::EndOfFile)));
    }

    #[test]
    fn rejects_unexpected_closing_brace_in_text_mode() {
        let mut lexer = Lexer::new("hi }");

        assert_eq!(
            lexer.next_token(),
            Ok(token(0, 3, TokenKind::Text("hi ".into())))
        );
        assert_eq!(
            lexer.next_token(),
            Err(LexerError::UnexpectedClosingBrace {
                span: SourceSpan::from_range(3, 4),
            })
        );
    }

    #[test]
    fn lexes_escaped_literal_braces_as_text() {
        let mut lexer = Lexer::new("struct X {{ value: {value} }}");

        assert_eq!(lexer.next_token(), Ok(token(0, 9, "struct X ".into())));
        assert_eq!(lexer.next_token(), Ok(token(9, 11, "{".into())));
        assert_eq!(lexer.next_token(), Ok(token(11, 19, " value: ".into())));
        assert_eq!(lexer.next_token(), Ok(token(19, 20, TokenKind::LeftBrace)));
        assert_eq!(
            lexer.next_token(),
            Ok(token(20, 25, TokenKind::Identifier("value".into())))
        );
        assert_eq!(lexer.next_token(), Ok(token(25, 26, TokenKind::RightBrace)));
        assert_eq!(lexer.next_token(), Ok(token(26, 27, " ".into())));
        assert_eq!(lexer.next_token(), Ok(token(27, 29, "}".into())));
    }

    #[test]
    fn rejects_unterminated_substitutions() {
        let mut lexer = Lexer::new("{name");

        assert_eq!(lexer.next_token(), Ok(token(0, 1, TokenKind::LeftBrace)));
        assert_eq!(
            lexer.next_token(),
            Ok(token(1, 5, TokenKind::Identifier("name".into())))
        );
        assert_eq!(
            lexer.next_token(),
            Err(LexerError::UnterminatedSubstitution {
                span: SourceSpan::from_range(5, 5),
            })
        );
    }

    #[test]
    fn lexes_fragment_directive_punctuation() {
        let mut lexer = Lexer::new("{@render item(value = model.name)}");
        let expected = [
            TokenKind::LeftBrace,
            TokenKind::At,
            TokenKind::Identifier("render".into()),
            TokenKind::Identifier("item".into()),
            TokenKind::LeftParenthesis,
            TokenKind::Identifier("value".into()),
            TokenKind::Equals,
            TokenKind::Identifier("model".into()),
            TokenKind::Dot,
            TokenKind::Identifier("name".into()),
            TokenKind::RightParenthesis,
            TokenKind::RightBrace,
            TokenKind::EndOfFile,
        ];

        for kind in expected {
            assert_eq!(lexer.next_token().unwrap().kind, kind);
        }
    }

    #[test]
    fn rejects_invalid_characters_inside_substitutions() {
        let mut lexer = Lexer::new("{user-name}");

        assert_eq!(lexer.next_token(), Ok(token(0, 1, TokenKind::LeftBrace)));
        assert_eq!(
            lexer.next_token(),
            Ok(token(1, 5, TokenKind::Identifier("user".into())))
        );
        assert_eq!(
            lexer.next_token(),
            Err(LexerError::InvalidCharacterInSubstitution {
                span: SourceSpan::from_range(5, 6),
                character: '-',
            })
        );
    }

    fn token<'a>(start: usize, end: usize, kind: TokenKind<'a>) -> Token<'a> {
        Token::new(SourceSpan::from_range(start, end), kind)
    }

    impl<'a> From<&'a str> for TokenKind<'a> {
        fn from(value: &'a str) -> Self {
            Self::Text(Cow::Borrowed(value))
        }
    }
}
