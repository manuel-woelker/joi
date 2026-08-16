# joix-tickets

`joix-tickets` is an experimental testbed for the main JOI libraries. It will
model a small issue tracker for bugs, tasks, and other work items.

## What does it exercise?

The crate currently provides basic project infrastructure only:

- a standalone Rust package
- a small in-process module abstraction and registry
- a default `TicketsModule` implementation
- a minimal executable that registers and displays its modules
- formatting, test, and lint commands

No JOI libraries are integrated yet. Dependencies and realistic workflows
should be added incrementally as their integration requirements become clear.

## How does the module registry work?

Modules implement the `Module` trait and provide a name, description, and
version through `ModuleInfo`. `ModuleRegistry` stores different module
implementations behind trait objects.

A module with a `Default` implementation can be registered by type:

```rust
let mut registry = ModuleRegistry::new();
registry.register::<TicketsModule>();
```

An already constructed module can instead be passed to `register_module`. The
current registry only owns and reports modules; lookup, lifecycle management,
and dependency handling are intentionally not implemented yet.

## How do I run it?

From this directory:

```bash
cargo run
```

The executable registers `TicketsModule` and prints the registry's debug view.

## How do I check it?

```bash
cargo fmt --all --check
cargo test
cargo clippy --all-targets -- -D warnings
```

## What is its status?

This crate is an internal, non-publishable example. It should stay small and
prefer realistic integration paths over becoming a second implementation of
the libraries it eventually demonstrates.
