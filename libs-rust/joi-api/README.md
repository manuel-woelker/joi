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
