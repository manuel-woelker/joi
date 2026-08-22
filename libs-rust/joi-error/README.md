# joi-error

`joi-error` provides shared names for error types used across JOI Rust
libraries. `JoiError` is an `error-stack` report with a boxed dynamic error
context, and `JoiResult<T>` is a standard result using that error type.

## What does the API look like?

```rust
use joi_error::{JoiResult, report};

fn load() -> JoiResult<()> {
    Err(report(std::io::Error::other("could not load data")))
}
```

`JoiError` and `JoiResult` are aliases rather than wrapper types. `BoxedError`
is a thin, sized context around `Box<dyn Error + Send + Sync>`, needed because
`error-stack::Report::new` requires a sized context implementing `Error`.
Concrete errors can be recovered through `BoxedError::downcast_ref` when
necessary.

## What is its status?

The crate is intentionally minimal and currently internal to the monorepo. It
exists to give JOI libraries consistent public type names without hiding the
underlying error model.

## How do I check it?

```bash
cargo fmt --all --check
cargo test
cargo clippy --all-targets -- -D warnings
cargo doc --no-deps
```
