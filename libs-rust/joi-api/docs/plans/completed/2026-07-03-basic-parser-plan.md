# What problem does this plan solve?

`joi-api` has a draft definition language and one example, but no machine-readable
representation. The project needs a basic lexer, parser, and abstract syntax
tree (AST) before semantic validation or source generation can begin.

This first implementation must preserve precise source locations throughout the
pipeline. Tokens, names, literals, types, declarations, and diagnostics should
all retain enough span information to produce useful errors without reparsing or
searching the original text.

# What was implemented?

The plan was completed on 2026-07-03. `joi-api-generator` now contains focused
source, span, diagnostic, AST, lexer, and parser modules. The parser returns a
fully spanned syntax AST plus structured lexer and parser diagnostics, preserves
comments as trivia, and performs bounded recovery at top-level, member, and
parameter boundaries.

The implementation stayed within the planned scope. Diagnostic rendering and
semantic interpretation remain follow-up work.

# What can be reused from Ocelot?

The implementation should adapt the proven source-handling patterns in
`../ocelot`, especially:

- half-open UTF-8 byte spans (`start..end`)
- a source file value that keeps logical path and source text together
- spans on every token, AST node, identifier, literal, and trivia item
- line and column information derived from byte offsets only when diagnostics
  are rendered
- lexer and parser diagnostics collected as structured data rather than returned
  as generic string errors
- conservative parser recovery that avoids cascades of misleading diagnostics

The Ocelot crate graph should not be copied wholesale. JOI API should keep this
slice inside `joi-api-generator`, using modules to separate source handling, the
AST, lexing, parsing, and diagnostics. Separate crates would add dependency and
release boundaries without providing useful independence at this stage.

# What should be included?

The first parser should cover all syntax currently documented in
`JOI-API-SPEC.md`:

- one `module` declaration
- `model`, `command`, and `query` declarations
- model fields, operation parameters, and return fields
- identifiers and string literals
- named and nested generic types
- line comments and whitespace
- optional trailing commas in parameter lists
- operations with and without `returns`

Semantic checks are out of scope. For example, the parser should represent
`partialExcept<"id", Ticket>` faithfully, while a later validation pass should
decide whether `partialExcept` exists, whether its argument count is correct,
and whether `id` is a field on `Ticket`.

# How should the generator crate be organized?

Add focused modules inside `joi-api-generator`:

```text
crates/joi-api-generator/src/
  lib.rs              Public API and module declarations
  span.rs             Byte spans and spanned values
  source_file.rs      Logical paths and immutable source text
  diagnostic.rs       Structured source diagnostics
  ast.rs              AST module declarations
  ast/                Individual AST concepts
  lexer.rs            Lexer module declarations
  lexer/              Tokens, trivia, and scanning
  parser.rs           Parser entrypoint and implementation
```

Keep module APIs narrow, but do not hide core parsed data behind private types:
future generators will consume the public AST. Avoid adding internal facade
layers that merely rename these modules.

# How should source locations be represented?

Use a small `Span` value containing half-open byte offsets into one `SourceFile`:

```rust
pub struct Span {
    pub start: usize,
    pub end: usize,
}
```

`Span` should be `Copy`, validate or clearly document `start <= end`, and provide
helpers for length, emptiness, joining adjacent syntax, and conversion to a byte
range. Empty spans are valid for end-of-file and missing-token diagnostics.

Use byte offsets as the canonical representation. Storing line and column on
every node duplicates data and becomes incorrect after edits. Diagnostic
rendering should derive human-readable locations from the source text, treating
columns consistently as Unicode scalar or display columns when rendering is
implemented.

Every token and AST structure should have an encompassing `span`. Every value
that users can name or that diagnostics may target should keep its own span,
including identifiers, string literals, operation kinds, and type constructors.
A generic `Spanned<T>` is appropriate where it reduces repetition without hiding
the meaning of larger AST nodes.

# What should the source and diagnostic API look like?

Introduce a `SourceFile` containing a logical path and immutable source text.
The public parse entrypoint should accept `&SourceFile`, not a bare `&str`, so
all diagnostics can identify their source.

Use a diagnostic model with:

- severity
- stable diagnostic code
- concise summary
- one primary label containing a span and message
- zero or more secondary labels
- optional notes

Lexer and parser errors should be returned in a parse output, not collapsed into
an internal error:

```rust
pub struct ParseOutput {
    pub document: Option<Document>,
    pub diagnostics: Vec<Diagnostic>,
}

pub fn parse(source_file: &SourceFile) -> ParseOutput;
```

Ordinary invalid user input must not use `panic!` or a generic boxed error.
Unexpected infrastructure failures may use a separate Rust `Result` later if a
real failure mode appears.

# What should the lexer produce?

Define explicit token kinds for keywords, identifiers, string literals,
punctuation, unexpected input, and end-of-file. Each token should include its
span and leading trivia. Trivia should retain spans for line comments, spaces,
and newlines so future documentation generation or formatting does not require
lexing the file again.

The lexer should:

- recognize keywords only when the complete identifier matches
- scan UTF-8 safely and never create spans inside a code point
- preserve the raw source span for identifiers and strings instead of eagerly
  allocating their text
- emit a diagnostic for an unexpected character and continue at the next valid
  UTF-8 boundary
- emit one precise diagnostic for an unterminated string, then append EOF and
  stop lexing conservatively
- always append an EOF token, including for empty and invalid files

Token text should be sliced from `SourceFile` on demand. String escape semantics
are not in the current specification and should not be invented in this slice.

# What shape should the AST use?

The AST should model syntax without performing name resolution or semantic type
interpretation. A suitable initial shape is:

```rust
Document { module, declarations, span }
ModuleDeclaration { name, span }
Declaration::{Model, Operation}
ModelDeclaration { name, fields, span }
Field { name, ty, span }
OperationDeclaration { kind, name, parameters, returns, span }
OperationKind::{Command, Query}
ReturnRecord { fields, span }
TypeExpression { kind, span }
TypeExpressionKind::{Named, Generic}
TypeArgument::{Type, StringLiteral}
Identifier { text, span }
StringLiteral { value, span }
```

The exact Rust modules may differ, but each public concept should have a
descriptive file name rather than being collected into catch-all `types.rs` or
`nodes.rs` files.

Generic type syntax should remain syntax-level. For example,
`list<partialExcept<"id", Ticket>>` is a generic type constructor with nested
type and string arguments. This keeps the parser extensible and leaves built-in
type rules to semantic validation.

Attach declaration-leading comments as spanned trivia or documentation data.
Preserving all punctuation in the AST is unnecessary; token spans remain
available during parsing, and the AST should retain only syntax needed by later
validation and generation.

# How should parsing and recovery work?

Implement a hand-written recursive-descent parser. The grammar is small, and a
manual parser gives direct control over spans, diagnostics, and recovery without
adding a parser-generator dependency.

Parser helpers should include `current`, `at`, `advance`, and `expect`. `expect`
should report a structured diagnostic at the current token, using a zero-width
EOF span when input ends unexpectedly.

Recover at declaration and member boundaries:

- top level: next `model`, `command`, `query`, or EOF
- model and return bodies: next semicolon or right brace
- parameter lists: next comma or right parenthesis

Recovery must always consume input before retrying to prevent infinite loops.
The initial implementation may omit a malformed declaration from the AST while
continuing with later declarations. If the module declaration is missing or
invalid, return no document because every later declaration would lack its
namespace.

# Which diagnostics matter in the first slice?

Add stable diagnostics for at least:

- unexpected characters
- unterminated string literals
- missing or duplicate module declarations
- unexpected top-level tokens
- missing declaration, field, parameter, or type names
- missing punctuation such as `:`, `;`, `,`, `>`, `)`, or `}`
- invalid type argument syntax
- unexpected trailing tokens

Tests should assert diagnostic codes, primary spans, source paths, and concise
messages. Rendered terminal output is not required yet; keeping diagnostics
structured makes a renderer a separate follow-up.

# What implementation order is recommended?

1. Add the source, diagnostic, AST, lexer, and parser modules to
   `joi-api-generator` and expose the intended public entrypoint.
2. Implement and test `Span`, `Spanned<T>`, `SourceFile`, and diagnostics.
3. Implement token, trivia, and lexer data structures.
4. Implement lexing for the complete draft syntax, including invalid-input
   diagnostics and UTF-8-safe spans.
5. Define the fully spanned AST.
6. Implement recursive-descent parsing for modules, declarations, fields,
   operations, return records, and nested type expressions.
7. Add boundary-based recovery and structured parser diagnostics.
8. Parse `examples/ticket.joi-api` as an end-to-end fixture and assert important
   AST spans against exact source slices.
9. Document the parser API and run all workspace checks.

# How will the work be verified?

Use colocated unit tests for source utilities, lexer behavior, parser helpers,
and individual grammar productions. Use black-box parser tests for complete
documents and malformed inputs.

Span tests should verify both numeric offsets and the exact source slice selected
by each span. Include ASCII, multibyte UTF-8 in comments and strings, empty input,
EOF errors, nested generic closing brackets, and CRLF input. Add regression tests
for every recovery bug found during implementation.

Run these checks from `libs-rust/joi-api`:

```bash
cargo fmt --all --check
cargo test --workspace --all-targets
cargo clippy --workspace --all-targets -- -D warnings
cargo doc --workspace --no-deps
```

# What assumptions and open questions remain?

- The plan assumes `../ocelot` is the intended reference named in the request.
- The initial parser accepts one source file and one module. Cross-file source
  IDs and imports should be designed together later.
- The specification does not define identifier Unicode rules. The lexer should
  initially accept ASCII identifier syntax and handle non-ASCII input safely;
  broader Unicode identifiers require an explicit spec decision.
- The specification does not define string escapes. String literals should
  preserve raw text and reject only unterminated input for now.
- Comment preservation is included because the specification anticipates
  documentation generation. Exact attachment rules may need refinement when a
  formatter or documentation generator is implemented.
- Semantic validation, diagnostic rendering, source generation, and incremental
  reparsing are explicitly out of scope.

# What concrete tasks track completion?

- [x] Add focused source, diagnostic, AST, lexer, and parser modules inside
      `joi-api-generator`.
- [x] Add tested span, source file, spanned value, and diagnostic primitives.
- [x] Define fully spanned tokens and trivia.
- [x] Implement and test the lexer for all current syntax and lexical failures.
- [x] Define the fully spanned document AST.
- [x] Implement and test recursive-descent parsing for all current declarations.
- [x] Add bounded recovery and structured parser diagnostics.
- [x] Add UTF-8, CRLF, EOF, malformed-input, and nested-type regression tests.
- [x] Parse `examples/ticket.joi-api` in an end-to-end fixture test.
- [x] Document public APIs and update workspace documentation.
- [x] Run formatting, tests, Clippy with warnings denied, and documentation builds.

# What verification was completed?

The completed implementation passed:

- `cargo fmt --all --check`
- `cargo test --workspace --all-targets` (16 tests)
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo doc --workspace --no-deps`
