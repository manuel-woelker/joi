# AGENTS.md

This file provides guidance to human developers and AI agents when working with code in this repository.

## Project Overview

`joi-template` is a type-safe template engine written in Rust.
The repository currently focuses on a clean Rust workspace foundation, project tooling, and contributor documentation for the engine and CLI.

Note: All developer documentation should be written in English.

## Documentation Strategy

Consult `docs/PLANS.md` when creating, updating, or completing plan documents in `docs/plans`.

### Planning

Use `docs/PLANS.md` for plan structure, naming, verification expectations, assumptions, and completion workflow.

### Question driven documentation

When writing documentation, prefer headings in the form of questions that are answered by the section body.
That makes it easier to scan and easier to tell whether a section is relevant.

### Function, interface, struct, and enum documentation

Public Rust items should use standard RustDoc comments.
RustDoc should describe what the item does and any important constraints or behavior.

## Testing strategy

Features should be automatically tested whenever practical.
Consult `docs/TESTING.md` when writing tests.

Tests should usually be colocated with the code they exercise.

Prefer:

- black-box tests over implementation-coupled tests
- data-driven tests when several inputs exercise the same rule
- regression tests for bug fixes

## Checks and formatting

When completing a unit of work, run `nao check` to verify that formatting, builds, linting, and tests are green.

## Commit messages

Commit messages should use the Conventional Commits format, for example `feat(cli): add render command`.

Below the first line, include a short body describing the change.

Append all user prompts included in the commit under a `User Prompts:` section.
Also include the agent model identifier used for the commit in a `Model:` section.
Always run `git add` and `git commit` as separate commands.

Use `git commit -F -` with heredoc syntax for multiline commit messages so the body stays predictable without temporary files.

Never push code or ask to push code.

## File naming and organization

Prefer small source files and descriptive names.
Avoid catch-all files when a focused file name would make intent clearer.

