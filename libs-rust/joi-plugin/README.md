# joi-plugin

`joi-plugin` provides typed, in-process plugin and extension registration for
JOI applications. It is experimental infrastructure intended for applications
that compose known Rust components during startup; it does not load dynamic
libraries or discover packages.

## How is it used?

An extension point is identified by its trait type. A plugin can define a point
and register implementations, while later plugins can add more implementations.

```rust
use joi_plugin::{PluginRegistry, plugin};

trait InfoProvider: Send + Sync {
    fn info(&self) -> &'static str;
}

struct VersionInfo;

impl InfoProvider for VersionInfo {
    fn info(&self) -> &'static str {
        "1.0.0"
    }
}

let registry = PluginRegistry::new();
registry.register(plugin("infra", |context| {
    context.register_extension_point::<dyn InfoProvider>()?;
    context.register_extension::<dyn InfoProvider>(Box::new(VersionInfo))?;
    Ok(())
}))?;

let values: Vec<_> = registry
    .extensions::<dyn InfoProvider>()?
    .iter()
    .map(InfoProvider::info)
    .collect();
assert_eq!(values, ["1.0.0"]);
# Ok::<(), joi_error::JoiError>(())
```

Cloned registries share one reader-writer-locked inner state. The registry owns
extension values, and an extension view retains a read lock while its `.iter()`
borrows them.

## What does it depend on?

- `joi-base` supplies `JoiString` for plugin names.
- `joi-error` supplies the common `JoiResult` error type.

## How is it checked?

```bash
cargo fmt --check
cargo test
cargo clippy --all-targets -- -D warnings
cargo doc --no-deps
```
