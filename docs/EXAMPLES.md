# What examples exist today?

The main runnable example currently lives at:

```text
crates/joi-template/examples/showcase.rs
```

Run it with:

```bash
cargo run -p joi-template --example showcase
```

# What does the showcase example demonstrate?

The showcase is intentionally scoped to the features that exist today:

- defining a nested schema with `DataType`
- importing a schema from a focused JSON Schema subset
- parsing a template with substitutions like `{user.name}`
- constructing runtime data with the built-in value representation
- traversing runtime data through the pluggable data access layer

It does not pretend that final template rendering is already implemented.

# Why does the example stop before rendering?

Because that is the current truth of the codebase.

The parser and runtime access layer exist today.
The final evaluation and rendering step does not yet exist in the same end-to-end form.

The example is meant to help readers understand the current architecture without misleading them about the project status.

# How can a schema be imported from JSON Schema?

Use `DataType::from_json_schema_str` when an existing JSON Schema document describes the same structural shape the template should expect:

```rust
use joi_template::schema::DataType;

let schema = DataType::from_json_schema_str(r#"
{
  "type": "object",
  "properties": {
    "user": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "is_admin": { "type": "boolean" }
      }
    }
  }
}
"#)?;
```

The importer currently supports primitive types, objects with `properties`, and arrays with a single item schema.
Unsupported JSON Schema features such as `$ref`, union types, tuple arrays, and validation-only constraints fail explicitly instead of being ignored.
