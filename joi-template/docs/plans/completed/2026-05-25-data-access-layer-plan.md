# What problem is this plan solving?

`joi-template` now has a schema and a template parser, but it still has no runtime data access layer.
To evaluate substitutions like `{user.name}`, the engine needs a pluggable way to traverse structured data without hardwiring itself to a single backing implementation such as `serde_json::Value`, `facet`, or an internal map type.

This plan defines the first data access layer using a GAT-based `ValueView` approach, while keeping error handling simple through one shared concrete error type.

# What should this work support?

The first data access layer should support:

- reading the root value of a data source
- checking the runtime kind of a value
- reading primitive values
- looking up fields on structured values
- iterating over list values
- surfacing access failures through a single concrete error type

The API should be expressive enough for template evaluation while staying narrow enough to adapt to multiple backends.

# Why use a GAT-based value view?

The runtime layer needs to borrow from backing data where possible and avoid forcing everything into boxed trait objects or eagerly copied intermediate values.

A GAT-based shape allows:

- returned value views to borrow from the backing source
- implementations to stay zero-copy where practical
- adapters for native values, `serde`, `facet`, or user-provided types

This should stay a read-only traversal API, not a deserialization API in disguise.

# Why use one shared concrete error type?

Making the runtime traits generic over arbitrary error types would complicate signatures and implementation work before the engine has real evaluation behavior.

Using one shared concrete error type should:

- simplify trait signatures
- keep adapters easy to implement
- give the engine one consistent failure surface
- leave room to enrich diagnostics later without redesigning the traits

The common error type should distinguish useful categories such as unsupported access, missing fields, type mismatches, and backend-specific adapter failures.

# What should the core API look like?

The initial runtime abstraction should likely have two main traits:

- a `DataSource` trait that provides access to the root value
- a `ValueView` trait that describes how to inspect and traverse a value

The core API should likely also introduce:

- a `ValueKind` enum for runtime classification
- a shared `DataError` type
- a small native in-memory value type used as the first backend and test fixture

The `ValueView` trait should support:

- `kind()`
- `as_str()`
- `as_bool()`
- `as_i64()`
- `as_f64()`
- `field(name)`
- list iteration

If list iteration needs a helper wrapper to stay ergonomic with GATs and the shared error type, that wrapper should be introduced deliberately instead of fighting the type system with ad hoc boxing everywhere.

# How should this fit with the existing schema?

The runtime access layer should remain separate from `DataType`.

`DataType` describes the expected shape of data for validation.
The new runtime traits describe how actual values are read during rendering.

That separation should make it possible to:

- validate one backend against the schema
- evaluate templates against different backends through the same runtime API
- avoid coupling schema evolution to storage implementation details

# What implementation order makes sense?

The implementation should proceed from shared concepts to a concrete usable backend:

1. simplify the existing schema root by using `DataType` directly if that cleanup still has not landed
2. add a new runtime module with `ValueKind`, `DataError`, `DataSource`, and `ValueView`
3. add a native in-memory value representation as the first `DataSource` backend
4. add tests for primitive access, field lookup, list traversal, and error behavior
5. expose the runtime API from the crate root
6. document assumptions that matter for future `serde` and `facet` adapters

This keeps the abstraction grounded in working code instead of designing purely in the abstract.

# In what order should the work be implemented?

- [x] Remove the `Model` wrapper and use `DataType` directly as the schema root if that cleanup is still pending.
- [x] Add a `runtime` or similarly named module for the data access layer.
- [x] Define a `ValueKind` enum for the runtime value categories needed by templates.
- [x] Define a shared concrete `DataError` type for traversal and adapter failures.
- [x] Define a `DataSource` trait that exposes a borrowed root value.
- [x] Define a GAT-based `ValueView` trait for primitive access, field lookup, and list traversal.
- [x] Add a native in-memory value backend that implements the runtime traits and serves as the default test backend.
- [x] Add focused tests for primitive reads, field lookup, missing fields, type mismatches, and list traversal.
- [x] Expose the runtime API from the crate root.
- [x] Review the API for obvious adapter pain points relevant to future `serde`, `facet`, and user-provided implementations.
- [x] Run `cargo fmt --all`.
- [x] Run `cargo test --workspace --all-targets --all-features`.
- [x] Run `cargo clippy --workspace --all-targets --all-features -- -D warnings`.

# How should this work be verified?

Verification should prove that the runtime API is both usable and strict enough for later evaluation work.

Tests should cover:

- root access from a data source
- primitive access on matching and mismatching kinds
- field lookup on structured data
- missing field behavior
- list element traversal
- stable error reporting through `DataError`

The implementation should also pass the repository-wide formatting, test, and clippy checks.

The implemented test coverage includes:

- root access from a native data source
- primitive access on matching and mismatching kinds
- field lookup on structured data
- missing field behavior through `Ok(None)`
- list element traversal
- stable type mismatch reporting through `DataError`

# What assumptions, risks, or open questions should be called out?

- Assume the first runtime API is read-only and does not attempt mutation or lazy writes.
- Assume one shared concrete `DataError` is preferable for now, even if some backends could expose richer native errors.
- Assume `DataType` and runtime value access should remain separate concepts.
- Resolved: list traversal uses a bespoke iterator type for the native backend instead of a boxed iterator or callback-based visitor.
- Resolved: missing fields are represented as `Ok(None)` from `field(name)`, while type mismatches remain hard errors.
- Resolved: runtime classification remains separate from the schema through a small `ValueKind` enum using shared `PrimitiveType` vocabulary.
- Scope note: the first `DataError` shape currently focuses on type mismatches plus a generic backend failure case, which is enough for the native backend but intentionally not exhaustive yet.
- Risk: if the first trait shape overfits the native in-memory backend, later `serde` or `facet` adapters may feel awkward.
- Risk: if template evaluation needs null-like semantics soon, `ValueKind` may need a `Null` variant earlier than currently planned.
