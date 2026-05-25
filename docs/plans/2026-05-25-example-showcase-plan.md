# What problem is this plan solving?

`joi-template` now has meaningful building blocks for schemas, template parsing, and runtime data access, but there is no cohesive example that shows how those pieces fit together.

That makes the project harder to understand for:

- contributors trying to orient themselves
- future users evaluating the design direction
- maintainers trying to verify whether the public API is actually pleasant to use

This plan covers creating a focused example that showcases the current feature set honestly, without faking features that do not exist yet.

# What should the example demonstrate?

The example should demonstrate the major implemented concepts together:

- defining a schema with `DataType`
- constructing runtime data using the built-in value representation
- parsing a template with substitutions
- traversing runtime data through the data access layer
- showing the current gap between parsing/data access and full rendering

The example should feel like a miniature walkthrough of the current architecture rather than a toy snippet with no connection to the real API.

# Where should the example live?

The best first location is probably one of:

- a runnable Rust example in `crates/joi-template/examples/`
- a companion section in `README.md`
- a deeper narrative document under `docs/`

The implementation should likely use more than one of these:

- a runnable example as the source of truth
- a shorter README excerpt that points to it

That avoids duplicating too much code while still making the example visible.

# What should the example actually do?

The example should use one coherent scenario such as generating a greeting or profile summary from structured data.

A good first example should include:

- a root struct with nested fields
- at least one list field in the schema or data model
- a template with multiple substitutions such as `{user.name}` and `{company.name}`
- explicit parsing output or debug printing if full rendering is still not implemented
- runtime field lookups that prove the traversal API is usable

If the example includes a list field before template iteration syntax exists, that field should still be used meaningfully, for example by demonstrating runtime traversal separately instead of pretending lists are renderable in templates already.

# How should the example stay honest about current capabilities?

The example should clearly separate:

- what the system can do today
- what the intended future workflow is

Specifically, it should not imply that full template rendering is already implemented if the current engine still returns input unchanged.

The example should probably:

- parse the template
- print or inspect the AST
- walk some runtime data
- mention that the final rendering step is still future work

That is more credible than shipping a misleading pseudo-end-to-end example.

# What implementation order makes sense?

The implementation should proceed from executable example code to surrounding documentation:

1. choose a single scenario that exercises schema, parsing, and runtime access together
2. add a runnable example under `examples/`
3. make sure the example uses current public APIs instead of private internals
4. add or update README and docs references to point at the example
5. add verification that the example compiles and stays in sync

This keeps the example grounded in real code and reduces documentation drift.

# In what order should the work be implemented?

- [ ] Choose a single example scenario that uses nested struct data, substitutions, and at least one list value.
- [ ] Add a runnable example under `crates/joi-template/examples/` that demonstrates schema construction, template parsing, and runtime data traversal.
- [ ] Make the example output explicit enough to show what succeeds today and what is still not implemented.
- [ ] Update `README.md` with a concise example section or pointer to the runnable example.
- [ ] Update or add supporting documentation under `docs/` if the example needs more narrative context than the README should carry.
- [ ] Add a test or compile-check strategy that keeps the example from silently drifting out of date.
- [ ] Run `cargo fmt --all`.
- [ ] Run `cargo test --workspace --all-targets --all-features`.
- [ ] Run `cargo clippy --workspace --all-targets --all-features -- -D warnings`.

# How should this work be verified?

Verification should prove that the example is both correct and useful.

That should include:

- compiling the example successfully
- confirming the example uses only public crate APIs
- checking that the example output matches current capabilities
- making sure documentation references point to the real example instead of stale inline snippets

The usual repository formatting, test, and clippy checks should also stay green.

# What assumptions, risks, or open questions should be called out?

- Assume the first showcase example should prioritize honesty and clarity over breadth.
- Assume the example should reflect current implemented capabilities, not the ideal final engine workflow.
- Open question: whether the example should live only in `examples/` plus README, or whether it also deserves a dedicated `docs/` walkthrough.
- Open question: whether a compile-only check is enough for the example, or whether it should also have an assertion-based test around its output.
- Risk: if the example leans too hard on debug output, it may feel more like an internal test than user-facing guidance.
- Risk: if the public API changes quickly, a README example can become stale unless the runnable example is treated as the source of truth.
