# What problem does this plan solve?

The API documentation converter currently treats every leading `//` comment as
public documentation. This mixes explanatory or implementation comments with
the published API contract and makes documentation attachment an implicit rule
owned by a downstream converter.

JOI API should support explicit `///` documentation comments. The lexer should
distinguish them from ordinary comments, the parser should attach them to
documentable AST nodes with exact spans, and documentation generation should
consume only that explicit AST data.

# What was implemented?

The plan was completed on 2026-07-04. The specification now defines explicit
`///` documentation and attachment rules. The lexer distinguishes documentation
from ordinary comments, and the parser attaches fully spanned `Documentation`
values to modules, models, fields, operations, parameters, and return fields.
Detached blocks produce `JAPI-P006` diagnostics without preventing recovery.

Documentation JSON now reads only explicit AST documentation and includes an
optional module description. The SolidJS overview renders that description, and
the ticket fixture uses `///` only for text intended for publication.

# What syntax should the specification define?

Update `JOI-API-SPEC.md` to distinguish ordinary and documentation comments:

```joi-api
// Internal note; not published.

/// A work item representing a bug, task, or issue.
///
/// Tickets use caller-provided identifiers.
model Ticket {
    /// Stable ticket identifier.
    id: id<Ticket>;
}
```

The specification should define these rules:

- `//` starts an ordinary line comment and never becomes API documentation.
- `///` starts a documentation line and attaches to the next module, model,
  field, command, query, parameter, or return field.
- Consecutive documentation lines form one documentation block.
- An empty `///` line creates a paragraph break in the resulting text.
- One optional space immediately after `///` is removed; remaining text is
  preserved as written for future Markdown rendering.
- A physical blank line or ordinary comment between a documentation block and
  its target breaks attachment.
- Trailing documentation comments are not supported in this first version.

# How should documentation be represented in the AST?

Add an explicit AST value rather than asking each consumer to inspect trivia:

```rust
pub struct Documentation {
    pub text: String,
    pub span: Span,
}
```

Add `documentation: Option<Documentation>` to every documentable node:

- `ModuleDeclaration`
- `ModelDeclaration`
- `Field`
- `OperationDeclaration`
- `Parameter`

Return fields already use `Field`, so they receive the same support. Keep
`leading_trivia` intact for future formatting and source-preserving tools.
Documentation spans should cover the complete attached block from the first
`/` through the final documentation line, excluding the following newline.

# How should lexing change?

Add `TriviaKind::DocumentationComment { text }` and recognize `///` before the
existing `//` rule. Preserve UTF-8-safe byte spans and store comment text without
the three slash markers. Ordinary `//` comments must continue to use
`TriviaKind::LineComment`.

Lexer tests should verify:

- `///` and `//` produce distinct trivia kinds
- exactly three or more leading slashes have documented behavior
- empty documentation lines are preserved
- multibyte documentation text has exact source spans
- CRLF and LF line endings produce equivalent documentation blocks

The initial rule should interpret exactly the first three slashes as the marker;
any additional slash is part of the documentation text. Thus `//// note`
produces the text `/ note`.

# How should the parser attach documentation?

Add one parser helper that examines the leading trivia for a documentable token
and returns its closest valid documentation block. It should:

1. Work backward from the declaration or member token.
2. Allow only whitespace and one line break between the final `///` line and
   the target.
3. Collect adjacent documentation lines separated by one line break.
4. Treat an empty `///` as an intentional empty line in the block.
5. Join collected lines with `\n` and compute one encompassing span.

The parser, not the documentation serializer, should own these rules. This
keeps every later consumer consistent.

Emit a structured parser diagnostic for a documentation block that cannot
attach to a supported node, including blocks separated from a target by a blank
line or ordinary comment and blocks left at end-of-file. Use the block span as
the primary label. Recovery should continue parsing the target normally.

# How should documentation generation change?

Change `ApiDocumentation::from_document` to read `node.documentation` directly
and remove the current `description(&Trivia)` conversion. Ordinary comments
must never appear in generated JSON.

Extend the documentation JSON shape with an optional top-level `description`
for module documentation. This is an additive schema change, so the existing
schema version can remain `1`. Mirror the field in the TypeScript interface and
render it in the documentation UI overview.

Update `examples/ticket.joi-api` to use `///` for text intended for generated
documentation. Keep syntax explanations as ordinary `//` comments or remove
them when they do not belong in the example.

# What implementation order is recommended?

1. Update `JOI-API-SPEC.md` with the `///` syntax and exact attachment rules.
2. Add the spanned `Documentation` AST type and optional fields on documentable
   nodes.
3. Distinguish documentation comments in the lexer and add focused lexer tests.
4. Implement parser attachment and orphan-block diagnostics.
5. Update parser and end-to-end tests for module, declaration, field, parameter,
   and return-field documentation.
6. Change the Rust documentation DTO to consume explicit AST documentation.
7. Add module descriptions to the JSON and SolidJS UI.
8. Migrate the ticket example and update affected documentation.
9. Run all Rust and frontend verification.

# How will the work be verified?

Rust tests should cover successful attachment at every supported AST location,
paragraph preservation, exact spans, UTF-8, CRLF, ordinary-comment exclusion,
blank-line separation, orphan diagnostics, and end-of-file recovery. The
documentation conversion test should prove that only `///` reaches JSON.

Frontend checks should verify the additive module description field and ensure
the standalone build still contains exactly one API data placeholder and one
output HTML file.

Run from `libs-rust/joi-api`:

```bash
cargo fmt --all --check
cargo test --workspace --all-targets
cargo clippy --workspace --all-targets -- -D warnings
cargo doc --workspace --no-deps
```

Run from `libs-rust/joi-api/api-docs-ui`:

```bash
pnpm check
pnpm build
```

# What assumptions and risks remain?

- Documentation text is preserved for Markdown rendering, but Markdown parsing
  and sanitization remain outside this change.
- This plan does not add block documentation comments such as `/** ... */`.
- Additive JSON fields remain compatible with schema version `1`; a future
  required or behavior-changing field should trigger a version decision.
- AST struct literals in tests and future consumers will need the new optional
  field. Constructors are not currently used to isolate that change.
- Orphan diagnostics make documentation mistakes visible, but attachment rules
  must be tested carefully to avoid flagging valid comments after recovery.

# What concrete tasks track completion?

- [x] Document `///` and attachment rules in `JOI-API-SPEC.md`.
- [x] Add a fully spanned `Documentation` AST type to every supported node.
- [x] Lex `///` separately from ordinary `//` comments.
- [x] Parse and attach contiguous documentation blocks.
- [x] Diagnose orphaned and separated documentation blocks without stopping recovery.
- [x] Add lexer, parser, UTF-8, CRLF, span, and recovery tests.
- [x] Generate JSON descriptions only from explicit AST documentation.
- [x] Add module descriptions to the Rust DTO and SolidJS UI.
- [x] Migrate `examples/ticket.joi-api` to intentional `///` comments.
- [x] Run all Rust and frontend verification commands.

# What verification was completed?

The completed implementation passed:

- `cargo fmt --all --check`
- `cargo test --workspace --all-targets` (26 tests)
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo doc --workspace --no-deps`
- `pnpm check`
- `pnpm build`
- single output-file and single-placeholder assertions for `dist/index.html`
