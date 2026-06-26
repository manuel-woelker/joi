/// A byte offset into source text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct SourceOffset(pub usize);

impl SourceOffset {
    /// Creates a new source offset from a byte index.
    #[must_use]
    pub fn new(offset: usize) -> Self {
        Self(offset)
    }
}
