# What is `joi-template`?

`joi-template` is a type-safe template engine written in Rust.
It currently focuses on building a clean workspace foundation for the library, CLI, and project tooling.

This document reflects the current direction of the repository and should evolve as the implementation becomes more concrete.

# What is the current goal of the repository?

The immediate goal is to create a maintainable base for the project:

- a reusable template engine library in `crates/joi-template`
- a command-line interface in `crates/joi-template-cli`
- repository tooling for checks, CI, and planning
- contributor documentation that keeps future implementation work disciplined

# What principles guide the project?

The project goals are also captured in `README.md`, but the short version is:

- templates should be type-safe
- templates should stay editable without recompiling the host program
- contributor feedback loops should stay fast and understandable

Those values should shape both the engine design and the developer experience around it.

