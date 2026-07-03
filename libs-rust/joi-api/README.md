# joi-api

`joi-api` is a Rust workspace for tools that parse abstract API descriptions and generate corresponding source code for multiple target languages.

The intended model is similar to gRPC: an API is described independently of a particular programming language, then generators produce language-specific types and interfaces. Initial target languages are expected to include Rust and TypeScript.

## What is the current status?

This project is at the infrastructure stage. The workspace and generator crate exist, and the initial [JOI API definition language draft](JOI-API-SPEC.md) documents the intended syntax. The parser, intermediate representation, and code generators have not been implemented yet.

## How is the workspace organized?

```text
crates/
  joi-api-generator/  Parser and source generation library
```

## How do I build and test it?

```bash
cargo build --workspace
cargo test --workspace
```

## How do I parse an API description?

The generator crate exposes a parser that returns a fully spanned syntax tree
and structured diagnostics:

```rust
use joi_api_generator::{parse, source_file::SourceFile};

let source = SourceFile::new("ticket.joi-api", "module ticket;");
let output = parse(&source);

assert!(output.diagnostics.is_empty());
assert_eq!(output.document.unwrap().module.name.text, "ticket");
```

Invalid source is reported through `output.diagnostics`. Ordinary syntax errors
do not panic or return opaque Rust errors.
