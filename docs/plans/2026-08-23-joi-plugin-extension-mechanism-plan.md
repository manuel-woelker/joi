# Joi Plugin Extension Mechanism Plan

## What are we building?

Create a new independent Rust crate at `libs-rust/joi-plugin` that lets an
application register named plugins. During registration, each plugin can add
typed extension points and extensions implementing those extension-point
traits. Consumers can later retrieve all extensions for a typed point without
downcasting individual values.

The initial implementation is an in-process composition mechanism. It does not
load dynamic libraries, discover packages, resolve plugin dependencies, or
support unloading.

## What should the public API look like?

Use the extension trait itself to identify each extension point:

```rust
use joi_plugin::{PluginRegistryBuilder, plugin};

trait InfoProvider: Send + Sync {
    fn info(&self) -> String;
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
        Box::new(VersionInfoProvider),
    )?;
    Ok(())
}))?;
let registry = builder.build();

for provider in registry.extensions::<dyn InfoProvider>()? {
    println!("{}", provider.info());
}
# Ok::<(), joi_error::JoiError>(())
```

The example added to `examples/joix-tickets/src/main.rs` is directional: Rust
requires the `dyn InfoProvider` trait-object spelling. Supplying that trait as
the method's generic parameter gives `Box::new(VersionInfoProvider)` the
expected `Box<dyn InfoProvider>` type, allowing the normal unsizing coercion at
the call site without an extension-point object.

## How will type erasure work?

The registration and lookup methods should use
`T: ?Sized + Send + Sync + 'static`. Internally, the registry should map
`TypeId::of::<T>()` to erased entries containing:

- `type_name::<T>()` for diagnostics.
- A `Vec<Box<T>>`, held in an entry erased as `Box<dyn Any + Send + Sync>`.

The registry should downcast the collection once when registering or retrieving
extensions. The registry owns each `Box<T>`, and lookup returns borrowed `&T`
values tied to the registry lifetime. Avoid unsafe casts and avoid requiring
extension implementations to know about the registry.

## How will plugin registration behave?

Plugins should have a unique `JoiString` name and a one-shot registration
callback. `PluginRegistry::register` should execute callbacks sequentially in
caller-defined order using a `PluginContext` scoped to that plugin.

Registration should be atomic per plugin: stage extension points and extensions
inside the context, validate the complete callback result, and merge them into
the registry only on success. A failed callback must not leave a partially
registered plugin. Within one callback, extensions may target points registered
earlier by that callback or by previously committed plugins.

Return `JoiResult` with formatted message errors for duplicate plugin names,
duplicate extension-point trait registration, unknown points, internal type
mismatches, and duplicate registration attempts. Do not introduce a
crate-specific error enum unless callers later need programmatic error
classification.

## Implementation Checklist

- [x] Create `libs-rust/joi-plugin` with `Cargo.toml`, `src/lib.rs`, a short
      README, and dependencies on `joi-base` and `joi-error`.
- [x] Define a named `Plugin` abstraction and a `plugin(name, description, callback)`
      constructor for one-shot registration callbacks returning `JoiResult<()>`.
- [x] Implement `PluginContext` with typed `register_extension_point` and
      `register_extension` methods whose generic parameter is the extension
      trait, whose registrations have stable IDs, and whose extension value is
      `Box<T>`.
- [x] Implement `PluginRegistryBuilder::register` with unique plugin names,
      caller-defined ordering, staged atomic commits, and contextual string
      errors.
- [x] Implement `PluginRegistryBuilder::build` to produce an immutable,
      cheaply cloneable registry, and `extensions::<T>()` lookup returning
      borrowed `&T` values while preserving registration order.
- [x] Split implementation into focused modules for extension collections,
      plugins, registration context, registry storage, and erased entries;
      re-export only the intended public API from `lib.rs`.
- [x] Add black-box tests for successful registration and invocation through a
      trait object, multiple extensions in stable order, cross-plugin extension
      registration, duplicate names, unknown points, distinct trait keys, and
      rollback after a failing plugin callback.
- [x] Evaluate compile-fail documentation or `trybuild` coverage. Normal Rust
      type checking and the API examples adequately demonstrate trait mismatch
      rejection, so no additional test dependency was added.
- [x] Adapt the `joix-tickets` usage sketch to real `InfoProvider` and
      `VersionInfoProvider` definitions, add the `joi-plugin` path dependency,
      and demonstrate retrieving and invoking the registered provider.
- [x] Add `joi-plugin` to the root README's current-library list and document
      purpose, status, API example, dependencies, and standard commands in the
      crate README.
- [x] Run formatting, tests, strict Clippy, and rustdoc for `joi-plugin`, then
      run the `joix-tickets` test and lint suites to verify integration.

## What assumptions does the plan make?

- Extension traits and implementations are `Send + Sync + 'static`. Extensions
  are owned in `Box` values by an immutable registry backed by
  `Arc<PluginRegistryInner>` and cannot outlive the registry borrow or be cloned
  out independently.
- Plugin registration is synchronous and completes before normal application
  operation begins.
- Plugin names are unique registry-wide. Extension points are identified by
  their trait `TypeId`, with `type_name` used only for diagnostics; neither is a
  persistent identifier.
- Registration order is meaningful and preserved for extension lookup.
- Plugins may extend points from earlier plugins, so caller registration order
  is currently the dependency-order mechanism.

## Open Questions

- Should registering the same concrete extension more than once be allowed?
  The proposed design allows it because trait objects do not provide a reliable
  implementation identity; callers can add explicit IDs later if deduplication
  becomes necessary.
- The final registry is immutable after startup, following the action-registry
  builder pattern. Runtime registration can be introduced later with an
  explicit snapshot mechanism if a concrete use case requires it.

## Verification

Run:

```bash
cargo fmt --manifest-path libs-rust/joi-plugin/Cargo.toml --check
cargo test --manifest-path libs-rust/joi-plugin/Cargo.toml
cargo clippy --manifest-path libs-rust/joi-plugin/Cargo.toml --all-targets -- -D warnings
cargo doc --manifest-path libs-rust/joi-plugin/Cargo.toml --no-deps

cargo test --manifest-path examples/joix-tickets/Cargo.toml
cargo clippy --manifest-path examples/joix-tickets/Cargo.toml --all-targets -- -D warnings
```

All commands completed successfully on 2026-08-23. The `joi-plugin` suite has
seven black-box tests, and the integrated `joix-tickets` suite has twenty tests.
