# AGENTS.md

This file provides guidance to human developers and AI agents when working with code in this repository.

## Project Overview

`joi` is a monorepo for a variety of mostly independent libraries that share a common theme.
Libraries should be able to evolve independently while keeping shared conventions, tooling, and documentation consistent across the repository.

All developer documentation should be written in English.

## Repository Principles

- Keep packages small, focused, and independently understandable.
- Prefer clear APIs over clever abstractions.
- Share code only when reuse is concrete and already needed by more than one package.
- Avoid coupling libraries through hidden global state, broad utility modules, or cross-package implementation leaks.
- Make package boundaries explicit through manifests, module names, and documentation.

## Documentation Strategy

Each library should have enough documentation for a new contributor to understand:

- What problem the library solves.
- Whether it is experimental, internal, or intended for external use.
- How to build, test, and use it.
- Which other packages it depends on and why.

When writing longer documentation, prefer headings framed as questions and answer them directly in the following paragraphs.
This makes documentation easier to scan and helps keep each section purposeful.

## Testing Strategy

Features should be covered by automated tests where practical.

- Prefer tests colocated with the code when the language ecosystem supports it.
- Prefer data-driven tests when they reduce duplication.
- Prefer black-box tests for package behavior.
- Use mocks sparingly, mainly at external boundaries such as filesystem, network, clocks, process execution, or platform APIs.
- Add regression tests for bug fixes.

## Checks and Formatting

Before completing a unit of work, run the most relevant checks for the packages touched.
If repository-wide tooling exists, prefer that over ad hoc commands.

When adding a new package, document its standard commands in the package README and wire it into shared checks when appropriate.

## Commit Messages

Commit messages should use Conventional Commits format, for example:

```text
feat(parser): Add token span tracking
```

Below the first line, include useful detail about the changes made.

Important:

- Append all user prompts included in the commit to the commit message body under a `User Prompts:` section.
- Include the agent model identifier used for the commit in a `Model:` section.
- Always run `git add` and `git commit` as separate commands.
- Never push code or ask to push code.

When crafting multiline commit messages, prefer `git commit -F -` with heredoc syntax to avoid shell escaping issues.

## File Naming and Organization

- Prefer descriptive file and module names.
- Avoid catch-all names like `index`, `types`, `utils`, or `helpers` unless they are idiomatic and narrowly scoped in that package.
- Keep source files small enough to review comfortably.
- Keep package-specific code inside that package unless it is intentionally promoted to shared infrastructure.
- Do not introduce a shared abstraction until at least two packages need it and the common shape is clear.

## Adding Libraries

When adding a new library:

- Give it a clear package name and short README.
- State its purpose, status, and intended audience.
- Keep its public API minimal at first.
- Add tests for the primary behavior.
- Add it to shared tooling only when that tooling is relevant.
- Avoid copying build configuration from another package without checking whether each setting still applies.
