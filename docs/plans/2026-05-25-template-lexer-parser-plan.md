# What problem is this plan solving?

`joi-template` currently has no real template syntax pipeline.
To make template rendering and validation possible, the project needs a lexer and parser for template source files, an AST that preserves source spans for diagnostics, and a shared string abstraction that keeps string ownership flexible.

This plan covers the first end-to-end parsing foundation for template source text.

# What behavior should this work support?

The initial template grammar should support:

- plain text segments
- substitutions surrounded by `{` and `}`

Examples:

- `Hello {name}!`
- `Dear {user.display_name}, welcome back.`

The parser output should preserve source span information for every AST node so later validation and diagnostics can point to exact source locations.

# What should the implementation look like?

The implementation should be introduced in layers, from reusable infrastructure to syntax-specific code:

1. add a shared string alias for copy-on-write string storage
2. add source position and source span types
3. define template AST types with spans on every node
4. implement an explicitly stateful lexer for template text and substitution delimiters
5. implement a parser that produces the AST from lexer output
6. expose the parser through the library with focused tests

This keeps diagnostics-friendly data structures in place before syntax code starts depending on them.

# How should shared strings be introduced?

Add a `SharedString` type alias based on `Cow<str>` and use it in AST text-bearing fields.

That should make it possible to:

- borrow source slices where practical
- own normalized or constructed strings where needed later
- avoid baking `String` into syntax structures too early

# How should source span tracking work?

Introduce small source-location primitives that can be reused by both lexer tokens and AST nodes.

The minimum useful shape is:

- a byte-offset based position or range model
- a `SourceSpan` type with `start` and `end`
- spans attached to tokens and every AST type

The parser should construct parent spans from child spans instead of leaving span math scattered around the codebase.

# What should the AST represent?

The AST should model the template file as structured syntax rather than raw strings.

The initial node set should likely include:

- a template root node
- text nodes
- substitution nodes
- a simple path or identifier node for substitution contents

If substitution contents are intentionally limited for the first iteration, the AST should reflect that clearly rather than pretending a richer expression language already exists.

# How should the lexer behave?

The lexer should tokenize enough structure for the parser without becoming a parser in disguise.
It should model its mode explicitly instead of inferring it indirectly from scattered conditionals.

The initial lexer state machine should likely include:

- a `Text` state for scanning raw template content
- a `Substitution` state for scanning the contents of `{...}`

The lexer should switch states only when it sees substitution delimiters, and that transition should be represented directly in the implementation.

The initial token set should likely include:

- text
- `{`
- `}`
- identifiers
- `.`
- end-of-file

The lexer should also report structured errors for malformed input such as:

- unterminated substitutions
- unexpected `}` outside a substitution
- invalid characters inside a substitution

# How should the parser behave?

The parser should turn the token stream into a template AST with correct spans and useful syntax errors.

The first parser iteration should:

- parse alternating text and substitution segments
- parse substitution contents as identifiers or dotted paths
- reject empty substitutions like `{}`
- reject malformed paths like `{user.}`

Parser APIs should return a typed result rather than panicking on malformed input.

# In what order should the work be implemented?

- [ ] Add a small shared string module with a `SharedString` alias based on `Cow<str>`.
- [ ] Add reusable source position and source span types for lexer and parser output.
- [ ] Define AST nodes for templates, text segments, substitutions, and substitution paths, with spans on every AST type.
- [ ] Update existing string-bearing syntax-facing structures to use `SharedString` where appropriate.
- [ ] Implement a lexer module with an explicit `Text` and `Substitution` state machine that tokenizes template text and substitution syntax and produces token spans.
- [ ] Add lexer error types and tests for valid input and malformed delimiter cases.
- [ ] Implement a parser module that consumes lexer tokens and produces the AST.
- [ ] Add parser error types and tests for valid templates, empty substitutions, malformed paths, and unmatched braces.
- [ ] Expose a top-level parse entry point from the crate API.
- [ ] Run `cargo fmt --all`.
- [ ] Run `cargo test --workspace --all-targets --all-features`.
- [ ] Run `cargo clippy --workspace --all-targets --all-features -- -D warnings`.

# How should this work be verified?

Verification should focus on observable syntax behavior and source accuracy.

Tests should cover:

- pure text templates
- templates with one substitution
- templates with multiple substitutions
- dotted substitution paths
- exact spans on root nodes and child nodes
- lexer failures for unmatched or misplaced braces
- parser failures for empty or malformed substitutions

The implementation should also pass the normal repository-wide formatting, test, and clippy checks.

# What assumptions or open questions need to be called out?

- Assume the first substitution grammar only supports identifiers and dotted field access, not arbitrary expressions.
- Assume `{` and `}` are reserved syntax in templates for now, with no escaping mechanism in this first iteration.
- Assume `SharedString` should be introduced as a lightweight alias first, not a custom wrapper type.
- Assume explicit lexer state is the intended architecture, not just an implementation detail hidden inside helper methods.
- Open question: whether the alias should be `Cow<'static, str>` or a lifetime-parameterized alias used internally by lexer and parser APIs.
- Open question: whether plain text tokens should preserve borrowed source slices all the way into the AST or be normalized into owned strings during parsing.
- Risk: if escaping rules are added later, lexer behavior around literal braces may need to change in ways that affect tests and AST assumptions.
