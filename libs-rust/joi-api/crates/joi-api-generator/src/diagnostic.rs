use std::path::{Path, PathBuf};

use crate::span::Span;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DiagnosticSeverity {
    Error,
    Warning,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiagnosticLabel {
    pub span: Span,
    pub message: String,
}

impl DiagnosticLabel {
    pub fn new(span: Span, message: impl Into<String>) -> Self {
        Self {
            span,
            message: message.into(),
        }
    }
}

/// Structured source diagnostic suitable for later terminal or editor rendering.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Diagnostic {
    pub severity: DiagnosticSeverity,
    pub code: &'static str,
    pub source_path: PathBuf,
    pub summary: String,
    pub primary: DiagnosticLabel,
    pub secondary: Vec<DiagnosticLabel>,
    pub notes: Vec<String>,
}

impl Diagnostic {
    pub fn error(
        code: &'static str,
        source_path: impl AsRef<Path>,
        summary: impl Into<String>,
        span: Span,
        label: impl Into<String>,
    ) -> Self {
        Self {
            severity: DiagnosticSeverity::Error,
            code,
            source_path: source_path.as_ref().to_owned(),
            summary: summary.into(),
            primary: DiagnosticLabel::new(span, label),
            secondary: Vec::new(),
            notes: Vec::new(),
        }
    }

    pub fn with_secondary(mut self, span: Span, message: impl Into<String>) -> Self {
        self.secondary.push(DiagnosticLabel::new(span, message));
        self
    }

    pub fn with_note(mut self, note: impl Into<String>) -> Self {
        self.notes.push(note.into());
        self
    }
}
