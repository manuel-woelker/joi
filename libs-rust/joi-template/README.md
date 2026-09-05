# joi-template

**A type-safe template engine written in Rust**

## Why yet another template engine?

`joi-template` aims to cover a combination that is still oddly rare:

1. **Templates are type-checked**. If names or types used in a template do not match the schema, that should fail during validation, not later during rendering.
2. **Templates stay dynamic**. Templates are not baked into a compiled binary and can be changed without recompiling the host application.

Many template engines give you either dynamic templates or strong typing. The goal here is to support both.

## What is the intended workflow?

1. Define a schema for the values a template may use.
2. Parse template files and validate them against that schema.
3. Load input data and validate it against the same schema.
4. Render output files from validated templates and validated data.

## What is the current status?

The repository currently provides the basic project infrastructure:

- two Rust crates in the repository workspace
- a core library crate in `crates/joi-template`
- a CLI crate in `crates/joi-template-cli`
- local verification via `nao check`
- CI and release workflow scaffolding

The template engine supports parsing, escaped literal braces, string
substitution rendering, and reusable fragments with named, typed parameters.
Schema validation, iteration, and conditional rendering are not implemented yet.

## How is the repository organized?

```text
crates/
  joi-template/      Core library crate
  joi-template-cli/  Command-line interface
docs/                Project and contributor documentation
```

## How do I get started?

```bash
cargo build -p joi-template -p joi-template-cli
cargo test -p joi-template -p joi-template-cli --all-targets --all-features
```

The current CLI accepts a single inline template string without external data:

```bash
cargo run -p joi-template-cli -- 'Hello, world!'
```

Library callers can render substitutions with `NativeDataSource`:

```rust
use std::collections::BTreeMap;
use joi_template::{NativeDataSource, NativeValue, render};

let data = NativeDataSource::new(NativeValue::struct_(BTreeMap::from([(
    "name".to_owned(),
    NativeValue::string("Ada"),
)])));

assert_eq!(render("Hello {name}!", &data)?, "Hello Ada!");
```

Use `{{` and `}}` for literal braces.

Fragments reuse template sections without coupling templates to external files:

```joi-template
{@fragment rust_field(name: string, type_name: string)}
    pub {name}: {type_name},
{@end}

pub struct {model.name} {{
{@render rust_field(name = model.id.name, type_name = model.id.type_name)}
}}
```

Fragment arguments are named paths and may be reordered. Supported parameter
types are `string`, `boolean`, `integer`, `float`, `struct`, and `list`.
Fragments may render fragments declared later in the same template. Recursive
renders and nested fragment declarations are rejected during parsing.

## What does the current API look like?

The crate now has a runnable showcase example that demonstrates:

- schema construction with `DataType`
- schema import from a focused JSON Schema subset
- template parsing for substitutions like `{user.name}`
- reusable fragments declared with `{@fragment}` and used with `{@render}`
- runtime data traversal through the pluggable data access layer

For example:

```rust
use joi_template::schema::DataType;

let schema = DataType::from_json_schema_str(r#"
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "tags": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
"#)?;
```

Run it with:

```bash
cargo run -p joi-template --example showcase
```

The showcase still stops short of schema-validated rendering. Basic string
substitution rendering is available, but schema validation is not connected to
the rendering pipeline yet.

## Where is the main example?

The source of truth lives in:

```text
crates/joi-template/examples/showcase.rs
```

That example is backed by public helper functions in the library so it stays compile-checked and testable.

## What are the project priorities?

1. **Excellent user experience**: This means great documentation and helpful error messages.
2. **Understandable implementation**: The code should stay easy to maintain, debug, and evolve.
3. **Well tested**: To ensure well-behaved operation and prevent regressions, a thorough test suite should ensure correctness.
