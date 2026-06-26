# What is this document for?

This document describes the testing expectations for `joi-template`.
Use it when adding features, fixing bugs, or changing behavior that should stay stable over time.

# Where should tests live?

Tests should usually be colocated with the code they exercise.

In practice, that means:

- unit tests live in the same Rust source file behind `#[cfg(test)]`
- crate-level integration tests are acceptable when behavior is easier to verify from the public API
- documentation-only changes do not need Rust tests unless they describe behavior that is also changing

# What testing style should be preferred?

Prefer small black-box tests that verify observable behavior.
If behavior is easier to understand as rendered output, assert on that output directly.

Prefer:

- data-driven tests when several inputs should exercise the same rule
- focused regression tests for every bug fix that changed behavior
- tests that encode user-visible failures, especially around diagnostics and rendering output

Avoid mocking when a straightforward in-memory alternative is practical.

# What should be verified for engine and CLI changes?

Engine and CLI changes should usually verify:

- rendering behavior
- validation behavior once that exists
- diagnostics and failure messages
- command-line behavior when new commands or flags are added

If a bug fix changed a diagnostic, emitted artifact, or command result, add a focused test for that exact behavior.

# What repository-wide checks should be run?

When completing a unit of work, run:

```bash
nao check
```

That task runs formatting, build, clippy, and the test suite.

# What should happen when a change is not tested?

Call it out explicitly in the final summary or commit context.
If a change is intentionally left without automated coverage, explain why the normal testing approach was not practical.

