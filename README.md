# joi-template

**A type-safe template engine written in Rust**

## Why yet another template engine?

`joi-template` aims to cover a combination that is still oddly rare:

1. **Templates are type-checked**. If names or types used in a template do not match the data model, that should fail during validation, not later during rendering.
2. **Templates stay dynamic**. Templates are not baked into a compiled binary and can be changed without recompiling the host application.

Many template engines give you either dynamic templates or strong typing. The goal here is to support both.

## What is the intended workflow?

1. Define a data model for the values a template may use.
2. Parse template files and validate them against that model.
3. Load input data and validate it against the same model.
4. Render output files from validated templates and validated data.

## What is the current status?

The repository currently provides the basic project infrastructure:

- a Rust workspace
- a core library crate in `crates/joi-template`
- a CLI crate in `crates/joi-template-cli`
- local verification via `nao check`
- CI and release workflow scaffolding

The actual template engine is still in an early placeholder stage. The current codebase is the foundation, not the finished product.

## How is the repository organized?

```text
crates/
  joi-template/      Core library crate
  joi-template-cli/  Command-line interface
docs/                Project and contributor documentation
```

## How do I get started?

```bash
cargo build --workspace
cargo test --workspace --all-targets --all-features
```

The current CLI accepts a single inline template string:

```bash
cargo run -p joi-template-cli -- 'Hello, {{ name }}'
```

Right now this returns the input unchanged. That is intentional until parsing, validation, and rendering behavior are implemented.

## What are the project priorities?

1. **Excellent user experience**: This means great documentation and helpful error messages.
2. **Understandable implementation**: The code should stay easy to maintain, debug, and evolve.
3. **Well tested**: To ensure well-behaved operation and prevent regressions, a thorough test suite should ensure correctness.
