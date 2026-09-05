# joi-api

`joi-api` is a Rust project for tools that parse abstract API descriptions and generate corresponding source code for multiple target languages.

The intended model is similar to gRPC: an API is described independently of a particular programming language, then generators produce language-specific types and interfaces. Initial target languages are expected to include Rust and TypeScript.

## What is the current status?

This project is at the infrastructure stage. The generator crate exists, and the initial [JOI API definition language draft](JOI-API-SPEC.md) documents the intended syntax. The parser, intermediate representation, and code generators have not been implemented yet.

## How is the workspace organized?

```text
api-docs-ui/          Standalone SolidJS API reference
crates/
  joi-api-generator/ Parser and source generation library
```

## How do I build and test it?

```bash
cargo build -p joi-api-generator
cargo test -p joi-api-generator
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

## How do I generate Rust code?

The Rust generator emits models, nominal ID types, operation inputs and outputs,
derived partial inputs, and a synchronous transport-neutral service trait:

```bash
cargo run -p joi-api-generator --bin joi-api-generate-rust -- libs-rust/joi-api/examples/ticket.joi-api
cargo run -p joi-api-generator --bin joi-api-generate-rust -- libs-rust/joi-api/examples/ticket.joi-api --output ticket.rs
```

The generator validates built-in type arguments, model references, field names,
and generated Rust name collisions before rendering. It uses the sibling
`joi-template` library through an explicit path dependency.

## How do I develop the API documentation UI?

The SolidJS documentation app lives in `api-docs-ui`. Install its dependencies,
then start the API server and Vite together from the repository root:

```bash
nao docs-dev
```

The underlying processes can also be run in separate terminals:

```bash
cd api-docs-ui
pnpm install
pnpm dev:api
```

```bash
cd api-docs-ui
pnpm dev
```

Vite serves the UI at `http://localhost:5173` and proxies `/api.json` to the
`joi-api-docs-server` binary at `127.0.0.1:8787`. The server reparses
`examples/ticket.joi-api` for every request.

## How do I build standalone documentation?

```bash
cd api-docs-ui
pnpm build
```

The build produces only `api-docs-ui/dist/index.html`, with JavaScript and CSS
inlined. Replace the single `__JOI_API_DATA__` marker in that file with the JSON
documentation object before distribution. JSON embedded in an HTML script must
escape `<` as `\u003c` so user-authored documentation cannot terminate the
script element early.
