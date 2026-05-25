use std::slice::Iter;

use crate::runtime::{DataError, NativeValue, NativeValueView};

/// An iterator over elements in a native list value.
#[derive(Debug, Clone)]
pub struct NativeListIter<'a> {
    iter: Iter<'a, NativeValue>,
}

impl<'a> NativeListIter<'a> {
    /// Creates a new native list iterator.
    #[must_use]
    pub fn new(iter: Iter<'a, NativeValue>) -> Self {
        Self { iter }
    }
}

impl<'a> Iterator for NativeListIter<'a> {
    type Item = Result<NativeValueView<'a>, DataError>;

    fn next(&mut self) -> Option<Self::Item> {
        self.iter
            .next()
            .map(|value| Ok(NativeValueView::new(value)))
    }
}
