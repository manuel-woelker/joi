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

### Decision Records

Consult [decision records](docs/decisions/README.md) before changing architecture,
public APIs, project conventions, or product behavior. Record significant choices
in `docs/decisions/` following [DR-000](<docs/decisions/DR-000 Record decisions in the repository.md>).
Use the next unused `DR-NNN Decision title.md` identifier and include the
decision, rationale, context, consequences, and alternatives.

Review records alongside the work. A proposal is not Accepted merely because
it was written. Preserve accepted history; supersede changed decisions with a
new, bidirectionally linked record. Ground retrospective records in code, plans,
or commits, and distinguish reconstructed reasoning from known history. Routine
changes do not require a record.

### Development Learnings

Consult [development learnings](docs/learnings/README.md) when investigating
unfamiliar behavior or working in an area with recorded findings. Create or
update a learning alongside work that establishes a reusable finding, such as a
surprising debugging result, disproved assumption, or performance or platform
pitfall. Routine changes and untested guesses do not need an entry.

Use `YYYY-MM-DD Finding title.md`, dated when the finding was established.
Include context, evidence, and references; distinguish observation from inference.
Update findings when evidence changes, preserving useful context. Link related
plans and decisions rather than duplicating them.

### Code Documentation

Document public functions, types, and interfaces using the language's standard
syntax, such as Rustdoc or TSDoc. Document fields when their purpose is not
clear from their name. Use ordinary comments sparingly to preserve non-obvious
rationale or workarounds; explain why, not what the code visibly does.

## UI Text Sources

Use the children-only span components in `ui/src/components/SourceText.tsx` to distinguish text by its source:

- `DataText` for values from records, such as a ticket key or a user's name.
- `ModelText` for model-defined names, such as entity and attribute labels.
- `FilterText` for query and filter expressions.
- Plain text for ordinary UI copy; do not wrap it in a source-text component.

Do not pass styling or DOM props to these components. The `Source Text` playground demo shows the treatments in context.

## Testing Strategy

Features should be covered by automated tests where practical.

- Prefer tests colocated with the code when the language ecosystem supports it.
- Prefer data-driven tests when they reduce duplication.
- Prefer black-box tests for package behavior.
- Use mocks sparingly, mainly at external boundaries such as filesystem, network, clocks, process execution, or platform APIs.
- Add regression tests for bug fixes.

## Checks and Formatting

All repository tooling runs through the `./n` wrapper at the repository root
(it bootstraps the pinned `nao` toolchain via `t`; bare `nao` is not on PATH).
Run `./n --list` to see the available tasks.

Never invoke `cargo` (or `pnpm`, `node`, `tsc`) directly: always route
through `./t` (for example `./t cargo test -p <package>`). Bare tool
invocations use a different toolchain than the pinned one and poison the
shared build cache, breaking subsequent `./n` runs.

Follow this checklist for every unit of work:

1. While working, run the most relevant checks for the packages touched
   (for example `./t cargo test -p <package>`).
2. After completing the unit of work, run the repository-wide checks with
   `./n check` from the repository root and fix any failures.
3. Then run `./n --restart` so active development tasks
   (watchers, dev servers) pick up the changes.

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

Commit each verified, coherent unit of work after `./n check` passes. Keep
unrelated changes in separate commits. For a minor follow-up to the latest
commit from the current task, rerun `./n check` and amend that commit rather
than creating a separate one.

Write multiline commit messages to a temporary file and use
`git commit -F <message-file>` (or `git commit --amend -F <message-file>`).
Do not use heredocs or heredoc delimiters to supply commit messages.

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
