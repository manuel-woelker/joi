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
- parsing a template with substitutions like `{user.name}`
- constructing runtime data with the built-in value representation
- traversing runtime data through the pluggable data access layer

It does not pretend that final template rendering is already implemented.

# Why does the example stop before rendering?

Because that is the current truth of the codebase.

The parser and runtime access layer exist today.
The final evaluation and rendering step does not yet exist in the same end-to-end form.

The example is meant to help readers understand the current architecture without misleading them about the project status.
