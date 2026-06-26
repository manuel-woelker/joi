use std::borrow::Cow;

/// A shared string representation that can borrow from source input or own data.
pub type SharedString<'a> = Cow<'a, str>;
