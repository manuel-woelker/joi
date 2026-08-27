# joi-plugin

`joi-plugin` provides typed, in-process plugin and extension registration for
JOI applications. It is experimental infrastructure intended for applications
that compose known Rust components during startup; it does not load dynamic
libraries or discover packages.

## How is it used?

An extension point is identified by its trait type. A plugin can define a point
and register implementations, while later plugins can add more implementations.

```rust
use joi_plugin::{PluginRegistryBuilder, plugin};

trait InfoProvider: Send + Sync {
    fn info(&self) -> &'static str;
}

struct VersionInfo;

impl InfoProvider for VersionInfo {
    fn info(&self) -> &'static str {
        "1.0.0"
    }
}

let mut builder = PluginRegistryBuilder::new();
builder.register(plugin("infra", "Infrastructure services", |context| {
    context.register_extension_point::<dyn InfoProvider>(
        "info-providers",
        "Contributes application information",
    )?;
    context.register_extension::<dyn InfoProvider>(
        "version-info",
        "Provides the application version",
        Box::new(VersionInfo),
    )?;
    Ok(())
}))?;
let registry = builder.build();

let values: Vec<_> = registry
    .extensions::<dyn InfoProvider>()?
    .map(InfoProvider::info)
    .collect();
assert_eq!(values, ["1.0.0"]);
# Ok::<(), joi_error::JoiError>(())
```

The builder owns the mutable registration phase. Building produces an immutable
registry whose clones share the same state. Extension lookup is lock-free and
borrows values directly from the registry.

Plugins, extension points, and extensions declare stable IDs during
registration. Point IDs and extension IDs are each unique registry-wide and
are committed atomically with the plugin callback. Their metadata is retained
in registration order and can be inspected without exposing extension values:

```rust
let plugins = registry.plugins().collect::<Vec<_>>();
let extension_points = registry.extension_points().collect::<Vec<_>>();
let extensions = registry.extensions_info().collect::<Vec<_>>();
```

Plugin metadata lists the points and extensions contributed by that plugin.
Extension-point metadata lists its registered extensions, including extensions
contributed by later plugins. Only successfully committed registrations are
included.

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
