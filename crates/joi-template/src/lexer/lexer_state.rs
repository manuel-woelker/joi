/// The current lexing mode for template source text.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LexerState {
    Text,
    Substitution,
}
