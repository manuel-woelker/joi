//! Parsing and source generation for JOI API descriptions.

pub mod ast;
pub mod diagnostic;
pub mod documentation;
pub mod lexer;
pub mod parser;
pub mod source_file;
pub mod span;

pub use parser::{ParseOutput, parse};
