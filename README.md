# joi

`joi` is a monorepo for a variety of mostly independent libraries that share a common theme.

The goal is to keep each library small, understandable, and useful on its own while sharing repository-level conventions for documentation, testing, and maintenance.

## What Belongs Here?

This repository is a good home for libraries that:

- Fit the shared theme of the repo.
- Can stand on their own as focused packages.
- Benefit from living near related libraries.
- Do not require tight coupling to unrelated packages.

Libraries should not depend on each other by accident.
When one package uses another, that relationship should be explicit and documented.

## Repository Layout

The layout is intentionally minimal while the monorepo is being bootstrapped.
Libraries are grouped by ecosystem, with Rust libraries living under `libs-rust/`.

As libraries are added, prefer a structure like:

```text
.
├── libs-rust/     # Independent Rust libraries
├── docs/          # Repository-level documentation, if needed
├── examples/      # Cross-library examples, if useful
└── scripts/       # Shared maintenance scripts, if useful
```

Package-specific documentation, examples, and tests should live with the package that owns them.

Current libraries:

- [`libs-rust/joi-api`](libs-rust/joi-api/README.md) - Infrastructure for generating source code from abstract API descriptions.
- [`libs-rust/joi-base`](libs-rust/joi-base/README.md) - Foundational shared types such as `JoiString`.
- [`libs-rust/joi-error`](libs-rust/joi-error/README.md) - Shared `error-stack` error and result types.
- [`libs-rust/joi-template`](libs-rust/joi-template/README.md) - A type-safe dynamic template engine.

Cross-library examples:

- [`examples/joix-tickets`](examples/joix-tickets/README.md) - Infrastructure for a future cross-library issue-tracker testbed.

## Working in This Repo

- Keep changes scoped to the package or shared tooling they affect.
- Add tests for meaningful behavior changes.
- Prefer local package checks first, then repository-wide checks when available.
- Document any new package with its purpose, status, and basic usage.

See [AGENTS.md](AGENTS.md) for contributor and agent guidance.

## Status

This repository is currently being bootstrapped.
Expect structure and tooling to evolve as the first libraries are added.
