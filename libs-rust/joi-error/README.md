# joi-error

`joi-error` provides shared names for error types used across JOI Rust
libraries. `JoiError` is an `error-stack` report with a boxed dynamic error
context, and `JoiResult<T>` is a standard result using that error type.

## What does the API look like?

```rust
use joi_error::{JoiResult, joi_bail};

fn load() -> JoiResult<()> {
    joi_bail!("could not load resource `{}`", "tickets.json");
}
```

`joi_error!` creates a `JoiError`, `joi_result!` creates an inferred
`JoiResult` error, and `joi_bail!` returns one immediately. `message` is the
non-formatting equivalent for an existing string. All four use `MessageError`
as their concrete, downcastable context.

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
