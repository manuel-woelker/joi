use crate::{
    ast::{Trivia, TriviaKind, TriviaPiece},
    diagnostic::Diagnostic,
    lexer::{Token, TokenKind},
    source_file::SourceFile,
    span::Span,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LexOutput {
    pub tokens: Vec<Token>,
    pub diagnostics: Vec<Diagnostic>,
}

pub fn lex(source_file: &SourceFile) -> LexOutput {
    Lexer::new(source_file).lex()
}

struct Lexer<'a> {
    source_file: &'a SourceFile,
    index: usize,
    tokens: Vec<Token>,
    diagnostics: Vec<Diagnostic>,
}

impl<'a> Lexer<'a> {
    fn new(source_file: &'a SourceFile) -> Self {
        Self {
            source_file,
            index: 0,
            tokens: Vec::new(),
            diagnostics: Vec::new(),
        }
    }

    fn lex(mut self) -> LexOutput {
        while self.index < self.source().len() {
            let leading_trivia = self.lex_trivia();
            if self.index == self.source().len() {
                self.tokens.push(Token::new(
                    TokenKind::EndOfFile,
                    leading_trivia,
                    self.source_file.eof_span(),
                ));
                return self.finish();
            }

            if !self.lex_token(leading_trivia) {
                self.tokens.push(Token::new(
                    TokenKind::EndOfFile,
                    Vec::new(),
                    self.source_file.eof_span(),
                ));
                return self.finish();
            }
        }

        self.tokens.push(Token::new(
            TokenKind::EndOfFile,
            Vec::new(),
            self.source_file.eof_span(),
        ));
        self.finish()
    }

    fn finish(self) -> LexOutput {
        LexOutput {
            tokens: self.tokens,
            diagnostics: self.diagnostics,
        }
    }

    fn source(&self) -> &str {
        self.source_file.source()
    }

    fn lex_trivia(&mut self) -> Trivia {
        let mut trivia = Vec::new();

        loop {
            let start = self.index;
            match self.current_byte() {
                Some(b' ' | b'\t') => {
                    while matches!(self.current_byte(), Some(b' ' | b'\t')) {
                        self.index += 1;
                    }
                    trivia.push(TriviaPiece::new(
                        TriviaKind::Whitespace,
                        Span::new(start, self.index),
                    ));
                }
                Some(b'\n' | b'\r') => {
                    let mut count = 0;
                    while matches!(self.current_byte(), Some(b'\n' | b'\r')) {
                        if self.current_byte() == Some(b'\r')
                            && self.source().as_bytes().get(self.index + 1) == Some(&b'\n')
                        {
                            self.index += 2;
                        } else {
                            self.index += 1;
                        }
                        count += 1;
                    }
                    trivia.push(TriviaPiece::new(
                        TriviaKind::Newlines { count },
                        Span::new(start, self.index),
                    ));
                }
                Some(b'/') if self.source().as_bytes().get(self.index + 1) == Some(&b'/') => {
                    self.index += 2;
                    while !matches!(self.current_byte(), None | Some(b'\n' | b'\r')) {
                        self.advance_char();
                    }
                    trivia.push(TriviaPiece::new(
                        TriviaKind::LineComment {
                            text: self.source()[start + 2..self.index].to_owned(),
                        },
                        Span::new(start, self.index),
                    ));
                }
                _ => break,
            }
        }

        trivia
    }

    /// Returns whether lexing can safely continue.
    fn lex_token(&mut self, leading_trivia: Trivia) -> bool {
        let start = self.index;
        let Some(byte) = self.current_byte() else {
            return true;
        };

        if is_identifier_start(byte) {
            self.index += 1;
            while self.current_byte().is_some_and(is_identifier_continue) {
                self.index += 1;
            }
            let kind = keyword_kind(&self.source()[start..self.index]);
            self.push(kind, leading_trivia, start);
            return true;
        }

        let kind = match byte {
            b':' => TokenKind::Colon,
            b',' => TokenKind::Comma,
            b';' => TokenKind::Semicolon,
            b'<' => TokenKind::LessThan,
            b'>' => TokenKind::GreaterThan,
            b'(' => TokenKind::LeftParen,
            b')' => TokenKind::RightParen,
            b'{' => TokenKind::LeftBrace,
            b'}' => TokenKind::RightBrace,
            b'"' => return self.lex_string(leading_trivia),
            _ => {
                self.advance_char();
                let span = Span::new(start, self.index);
                self.diagnostics.push(Diagnostic::error(
                    "JAPI-L001",
                    self.source_file.path(),
                    "unexpected character",
                    span,
                    "this character is not valid JOI API syntax",
                ));
                self.tokens
                    .push(Token::new(TokenKind::Unexpected, leading_trivia, span));
                return true;
            }
        };

        self.index += 1;
        self.push(kind, leading_trivia, start);
        true
    }

    fn lex_string(&mut self, leading_trivia: Trivia) -> bool {
        let start = self.index;
        self.index += 1;

        while let Some(byte) = self.current_byte() {
            match byte {
                b'"' => {
                    self.index += 1;
                    self.push(TokenKind::StringLiteral, leading_trivia, start);
                    return true;
                }
                b'\n' | b'\r' => break,
                _ => self.advance_char(),
            }
        }

        let span = Span::new(start, self.index);
        self.diagnostics.push(Diagnostic::error(
            "JAPI-L002",
            self.source_file.path(),
            "unterminated string literal",
            span,
            "add a closing `\"` before the end of the line",
        ));
        false
    }

    fn push(&mut self, kind: TokenKind, leading_trivia: Trivia, start: usize) {
        self.tokens.push(Token::new(
            kind,
            leading_trivia,
            Span::new(start, self.index),
        ));
    }

    fn current_byte(&self) -> Option<u8> {
        self.source().as_bytes().get(self.index).copied()
    }

    fn advance_char(&mut self) {
        let width = self.source()[self.index..]
            .chars()
            .next()
            .map(char::len_utf8)
            .unwrap_or(0);
        self.index += width;
    }
}

const fn is_identifier_start(byte: u8) -> bool {
    byte.is_ascii_alphabetic() || byte == b'_'
}

const fn is_identifier_continue(byte: u8) -> bool {
    is_identifier_start(byte) || byte.is_ascii_digit()
}

fn keyword_kind(text: &str) -> TokenKind {
    match text {
        "module" => TokenKind::Module,
        "model" => TokenKind::Model,
        "command" => TokenKind::Command,
        "query" => TokenKind::Query,
        "returns" => TokenKind::Returns,
        _ => TokenKind::Identifier,
    }
}

#[cfg(test)]
mod tests {
    use super::lex;
    use crate::{ast::TriviaKind, lexer::TokenKind, source_file::SourceFile, span::Span};

    #[test]
    fn lexes_keywords_nested_types_and_trailing_comments() {
        let source = SourceFile::new(
            "test.joi-api",
            "module ticket;\r\n// ids\nfield: list<id<Ticket>>;",
        );

        let output = lex(&source);
        let kinds: Vec<_> = output.tokens.iter().map(|token| token.kind).collect();

        assert_eq!(
            kinds,
            vec![
                TokenKind::Module,
                TokenKind::Identifier,
                TokenKind::Semicolon,
                TokenKind::Identifier,
                TokenKind::Colon,
                TokenKind::Identifier,
                TokenKind::LessThan,
                TokenKind::Identifier,
                TokenKind::LessThan,
                TokenKind::Identifier,
                TokenKind::GreaterThan,
                TokenKind::GreaterThan,
                TokenKind::Semicolon,
                TokenKind::EndOfFile,
            ]
        );
        assert!(output.diagnostics.is_empty());
        assert!(matches!(
            output.tokens[3].leading_trivia[1].kind,
            TriviaKind::LineComment { .. }
        ));
        assert!(matches!(
            output.tokens[3].leading_trivia[0].kind,
            TriviaKind::Newlines { count: 1 }
        ));
    }

    #[test]
    fn unexpected_unicode_character_has_complete_utf8_span() {
        let source = SourceFile::new("test.joi-api", "module té;");
        let output = lex(&source);

        assert_eq!(output.diagnostics.len(), 1);
        assert_eq!(output.diagnostics[0].code, "JAPI-L001");
        assert_eq!(output.diagnostics[0].primary.span, Span::new(8, 10));
        assert_eq!(source.span_text(Span::new(8, 10)), Some("é"));
    }

    #[test]
    fn unterminated_string_stops_with_eof_and_precise_span() {
        let source = SourceFile::new("test.joi-api", "partialExcept<\"id\nmodel X {}");
        let output = lex(&source);

        assert_eq!(output.diagnostics.len(), 1);
        assert_eq!(output.diagnostics[0].code, "JAPI-L002");
        assert_eq!(output.diagnostics[0].primary.span, Span::new(14, 17));
        assert_eq!(output.tokens.last().unwrap().kind, TokenKind::EndOfFile);
        assert_eq!(output.tokens.last().unwrap().span, source.eof_span());
    }

    #[test]
    fn multibyte_string_content_keeps_utf8_boundaries() {
        let source = SourceFile::new("test.joi-api", "type<\"ïd\">");
        let output = lex(&source);
        let string = output
            .tokens
            .iter()
            .find(|token| token.kind == TokenKind::StringLiteral)
            .unwrap();

        assert!(output.diagnostics.is_empty());
        assert_eq!(source.span_text(string.span), Some("\"ïd\""));
    }
}
