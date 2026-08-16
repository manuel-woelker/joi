# joix-tickets

`joix-tickets` is an experimental testbed for the main JOI libraries. It will
model a small issue tracker for bugs, tasks, and other work items.

## What does it exercise?

The crate currently provides basic project infrastructure only:

- a standalone Rust package
- a minimal executable
- formatting, test, and lint commands

No JOI libraries are integrated yet. Dependencies and realistic workflows
should be added incrementally as their integration requirements become clear.

## How do I run it?

From this directory:

```bash
cargo run
```

The executable currently prints a placeholder message.

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
