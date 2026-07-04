# What problem does this plan solve?

`joi-api-generator` can parse JOI API definitions but cannot yet validate their
type semantics or generate source code. The first generator should turn a valid
API document into deterministic, compilable Rust while using `joi-template` for
the source templates.

This work crosses two independently versioned libraries. The dependency must be
explicit, and the `joi-template` work should stay limited to capabilities needed
for real code generation rather than growing a general control-flow language.

# What blocks using `joi-template` today?

`joi-template` currently parses text and substitutions, but its renderer returns
the input unchanged. It also treats Rust braces as template syntax and has no
escape syntax for literal `{` or `}`. It cannot render a Rust source template in
its current state.

Implement these narrow prerequisites in `joi-template`:

- `{{` and `}}` produce literal braces in template text
- a rendering API accepts a `DataSource`
- substitutions resolve dotted field paths
- this first renderer accepts string values and reports missing paths or
  non-string values as structured render errors
- parse and render failures retain template spans

Loops and conditionals are not required. The generator can render one small
template per repeated model, field, operation, or helper and then pass those
rendered fragments into enclosing templates.

# What Rust should the first generator produce?

Generate one self-contained Rust source file containing:

- module-level and item-level Rust doc comments derived from JOI API `///` text
- public model structs
- one nominal ID newtype per referenced model ID
- operation input structs
- operation output structs when an operation declares return fields
- operation-scoped helper structs for structural `partialExcept` inputs
- one service trait containing every command and query

For the ticket example, the broad output shape should be:

```rust
pub struct TicketId(pub String);

pub struct Ticket {
    pub id: TicketId,
    pub title: String,
    pub description: String,
}

pub struct GetInput {
    pub ticket_ids: Vec<TicketId>,
}

pub struct GetOutput {
    pub tickets: Vec<Ticket>,
}

pub trait TicketApi {
    type Error;

    fn get(&self, input: GetInput) -> Result<GetOutput, Self::Error>;
}
```

Methods should be synchronous and transport-neutral in this first slice.
Commands without return fields use `Result<(), Self::Error>`. Atomic command
semantics remain part of the generated documentation contract; generated types
cannot enforce transactionality.

# How should JOI API types map to Rust?

Implement and test these mappings:

| JOI API | Rust |
| --- | --- |
| `string` | `String` |
| `Model` | `Model` |
| `id<Model>` | `ModelId` |
| `list<T>` | `Vec<T>` |
| `optional<T>` | `Option<T>` |
| `partialExcept<"field", Model>` | generated structural helper |

`partialExcept` helpers should be named from their operation and parameter
context, for example `UpdateTicketsItem`. The named exception field remains
required and all other model fields become `Option<T>`. Nested wrappers such as
`list<partialExcept<...>>` should map naturally to `Vec<UpdateTicketsItem>`.

Generate `Debug`, `Clone`, `PartialEq`, and `Eq` derives for generated data
types. Do not add serde derives or dependencies until a serialization contract
is defined.

# What semantic validation is required before rendering?

Add a small Rust-generation IR between the syntax AST and templates. Building
that IR should resolve names and reject unsupported or ambiguous input with
source diagnostics.

Validate at least:

- model and operation names are unique
- field, parameter, and return names are unique in their scopes
- named types refer to declared models or supported built-ins
- `id` has exactly one model type argument
- `list` and `optional` each have exactly one type argument
- `partialExcept` has one string field name and one model type
- the required `partialExcept` field exists on the model
- unsupported generic constructors and argument shapes are rejected
- generated Rust names do not collide after case conversion
- Rust keywords are emitted as raw identifiers where legal or diagnosed where
  raw identifiers cannot solve the collision

Diagnostics should point to the narrowest existing JOI API span, with secondary
labels for conflicting declarations where useful. Do not pass malformed syntax
ASTs into generation when parser diagnostics already contain errors.

# How should names be converted?

Use deterministic naming rules:

- JOI API model names become Rust `PascalCase`
- field, parameter, operation, and module names become `snake_case`
- operation input and output types use `<Operation>Input` and
  `<Operation>Output`
- model IDs use `<Model>Id`
- the service trait uses `<Module>Api`

Implement naming as tested Rust code rather than inside templates. Preserve the
original source span with each resolved name so collisions and invalid names can
produce useful diagnostics.

# How should templates be organized?

Add focused template files under
`crates/joi-api-generator/templates/rust/`, for example:

```text
file.joi-template
model.joi-template
field.joi-template
id-newtype.joi-template
operation-input.joi-template
operation-output.joi-template
service-method.joi-template
service-trait.joi-template
```

Load them with `include_str!` so generation does not depend on the process
working directory. Keep syntax decisions visible in templates and semantic
decisions in Rust. Do not hide name conversion, type resolution, or conditional
business rules in pre-rendered magic strings merely to claim template usage.

Repeated fragments and optional sections may be assembled in Rust, but each
source construct should be rendered by its corresponding `joi-template` file.

# What public API and binary should be added?

Add a library API with a diagnostic-aware result:

```rust
pub struct RustGenerationOutput {
    pub source: Option<String>,
    pub diagnostics: Vec<Diagnostic>,
}

pub fn generate_rust(document: &Document, source_file: &SourceFile)
    -> RustGenerationOutput;
```

Also add a `joi-api-generate-rust` binary that:

1. reads one `.joi-api` file
2. parses it
3. stops and prints diagnostics if parsing or validation fails
4. writes generated Rust to stdout by default
5. optionally writes to a path supplied with `--output`

Keep argument parsing minimal and consistent with the existing small binaries.
Do not add a CLI framework unless the option surface actually grows.

# How should `joi-template` be integrated?

Add an explicit path dependency from `joi-api-generator` to the sibling
`joi-template` crate. Document why this cross-library dependency exists. The
relative path must work when building the `joi-api` workspace from its own root.

The generator should convert each template context to `NativeDataSource` values
and call the real rendering API. Template parse or rendering failures should be
treated as generator implementation errors with the template name and span,
not as errors in the user's `.joi-api` source.

# What implementation order is recommended?

1. Add literal-brace parsing and structured scalar/path rendering to
   `joi-template`, with focused tests and public API documentation.
2. Add the explicit path dependency and embedded Rust template files.
3. Implement Rust naming conversion and keyword handling.
4. Build and test the validated Rust-generation IR.
5. Implement type mapping, ID discovery, and operation-scoped structural helper
   generation.
6. Render models, IDs, helpers, operation inputs/outputs, and service methods
   through `joi-template`.
7. Assemble and expose the complete source-generation API.
8. Add the `joi-api-generate-rust` binary and usage documentation.
9. Add golden, diagnostic, determinism, and compile tests.
10. Run checks in both affected Rust workspaces.

# How will the work be verified?

Add `joi-template` tests for escaped braces, dotted substitutions, missing
fields, wrong value kinds, UTF-8 values, and exact error spans.

Add generator tests for every type mapping, nested generics, nominal IDs,
derived partial structs, naming conversion, keyword handling, documentation,
duplicate names, unknown types, invalid built-in arguments, and deterministic
output.

Use `examples/ticket.joi-api` as the end-to-end golden fixture. Compare generated
source with a checked-in expected `.rs` file, then compile that file in a test or
verification script so syntactically invalid templates cannot pass review.
Exercise the binary for stdout and `--output` behavior.

Run from `libs-rust/joi-template`:

```bash
cargo fmt --all --check
cargo test --workspace --all-targets --all-features
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo doc --workspace --no-deps
```

Run from `libs-rust/joi-api`:

```bash
cargo fmt --all --check
cargo test --workspace --all-targets
cargo clippy --workspace --all-targets -- -D warnings
cargo doc --workspace --no-deps
```

# What assumptions and open questions remain?

- The first generator assumes IDs are string-backed Rust newtypes. The JOI API
  specification should eventually define ID representation explicitly.
- The first service trait is synchronous. Async traits should be designed with
  transport and runtime requirements rather than guessed now.
- Generated types intentionally omit serde and validation derives.
- The service trait uses one associated `Error` because operation errors are
  implicit in the current specification.
- Generated code is a single source file. Multi-file module layout can be added
  after the public shape stabilizes.
- The exact policy for acronym conversion (`HTTPServer` versus `HttpServer`)
  needs a documented test table before implementation.
- Rust doc text may contain Markdown, but generated `///` lines must safely
  preserve blank lines and embedded newlines.
- Extending `joi-template` is required. Pretending its current no-op renderer is
  sufficient would move generation logic into ad hoc string concatenation and
  defeat the stated architecture.

# What concrete tasks track completion?

- [ ] Implement escaped literal braces in `joi-template`.
- [ ] Implement structured string/path substitution rendering in `joi-template`.
- [ ] Add the explicit `joi-template` dependency and embedded Rust templates.
- [ ] Implement Rust identifier conversion, keyword handling, and collision diagnostics.
- [ ] Add the validated Rust-generation IR and built-in type validation.
- [ ] Map models, IDs, collections, optionals, and `partialExcept` helpers to Rust.
- [ ] Render all Rust source constructs through focused `joi-template` files.
- [ ] Expose the diagnostic-aware Rust generation API.
- [ ] Add the `joi-api-generate-rust` binary and document its usage.
- [ ] Add golden, compile, CLI, diagnostic, span, and determinism tests.
- [ ] Run all planned checks in both Rust workspaces.
