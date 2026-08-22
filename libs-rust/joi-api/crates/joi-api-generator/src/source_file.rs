use joi_base::JoiString;
use std::path::{Path, PathBuf};

use crate::span::Span;

/// Immutable source text together with its logical path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceFile {
    path: PathBuf,
    source: JoiString,
}

impl SourceFile {
    pub fn new(path: impl Into<PathBuf>, source: impl Into<JoiString>) -> Self {
        Self {
            path: path.into(),
            source: source.into(),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn source(&self) -> &str {
        &self.source
    }

    pub fn span_text(&self, span: Span) -> Option<&str> {
        self.source.get(span.as_range())
    }

    pub fn eof_span(&self) -> Span {
        Span::new(self.source.len(), self.source.len())
    }
}

#[cfg(test)]
mod tests {
    use super::SourceFile;
    use crate::span::Span;

    #[test]
    fn slices_source_at_utf8_boundaries() {
        let source = SourceFile::new("example.joi-api", "aéz");

        assert_eq!(source.span_text(Span::new(1, 3)), Some("é"));
        assert_eq!(source.span_text(Span::new(1, 2)), None);
        assert_eq!(source.eof_span(), Span::new(4, 4));
    }
}
