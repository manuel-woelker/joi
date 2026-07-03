use std::ops::Range;

/// Half-open byte span within a source file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub struct Span {
    pub start: usize,
    pub end: usize,
}

impl Span {
    /// Creates a span from byte offsets.
    ///
    /// # Panics
    ///
    /// Panics when `start` is greater than `end`.
    pub const fn new(start: usize, end: usize) -> Self {
        assert!(start <= end, "span start must not exceed its end");
        Self { start, end }
    }

    pub const fn len(self) -> usize {
        self.end - self.start
    }

    pub const fn is_empty(self) -> bool {
        self.start == self.end
    }

    /// Returns the smallest span containing both inputs.
    pub const fn join(self, other: Self) -> Self {
        Self::new(
            if self.start < other.start {
                self.start
            } else {
                other.start
            },
            if self.end > other.end {
                self.end
            } else {
                other.end
            },
        )
    }

    pub const fn as_range(self) -> Range<usize> {
        self.start..self.end
    }
}

/// A value paired with its exact source span.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Spanned<T> {
    pub value: T,
    pub span: Span,
}

impl<T> Spanned<T> {
    pub const fn new(value: T, span: Span) -> Self {
        Self { value, span }
    }
}

#[cfg(test)]
mod tests {
    use super::Span;

    #[test]
    fn span_supports_empty_ranges_and_joins() {
        let left = Span::new(2, 5);
        let right = Span::new(5, 9);

        assert_eq!(left.len(), 3);
        assert!(!left.is_empty());
        assert_eq!(left.join(right), Span::new(2, 9));
        assert_eq!(Span::new(4, 4).as_range(), 4..4);
    }
}
