use crate::span::Span;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Identifier {
    pub text: JoiString,
    pub span: Span,
}

impl Identifier {
    pub fn new(text: impl Into<JoiString>, span: Span) -> Self {
        Self {
            text: text.into(),
            span,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct StringLiteral {
    /// Decoded contents. This equals the text between quotes until escapes exist.
    pub value: JoiString,
    /// Span including the opening and closing quotes.
    pub span: Span,
}

impl StringLiteral {
    pub fn new(value: impl Into<JoiString>, span: Span) -> Self {
        Self {
            value: value.into(),
            span,
        }
    }
}
use joi_base::JoiString;
