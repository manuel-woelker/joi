# What problem does this plan solve?

`joi-template` can render text and substitutions, but reusable fragments must be
split across Rust constants or duplicated. Templates need named fragments that
render a reusable body with explicit inputs.

Fragment parameters and render arguments should be named and typed. Positional
arguments would become difficult to review as fragments evolve, while untyped
parameters would defer avoidable mistakes until field traversal or rendering.

# What syntax should fragments use?

Use the existing brace-delimited template syntax:

```joi-template
{@fragment rust_field(name: string, type_name: string)}
    pub {name}: {type_name},
{@end}

pub struct {model.name} {{
{@render rust_field(name = model.id.name, type_name = model.id.type_name)}
{@render rust_field(name = model.title.name, type_name = model.title.type_name)}
}}
```

The syntax has these rules:

- `{@fragment name(parameter: type, ...)}` starts a fragment definition.
- `{@end}` closes the current fragment definition.
- `{@render name(argument = path, ...)}` renders a fragment.
- Parameters and arguments are always named.
- Argument order does not matter.
- Fragment definitions produce no output at their declaration site.
- Fragments may be rendered before or after their definitions.
- Nested fragment definitions are invalid.
- Fragment bodies may render other fragments.
- Fragments always produce rendered text; there is no explicit `return` syntax.

Keep imports/includes outside this change. Fragments reuse template parts within one
parsed template; resolving templates from other files requires a separate
resolver design.

# Which parameter types should be supported?

Map parameter type names to the runtime kinds already exposed by `ValueKind`:

| Template type | Required runtime value |
| --- | --- |
| `string` | string primitive |
| `boolean` | boolean primitive |
| `integer` | integer primitive |
| `float` | float primitive |
| `struct` | structured value |
| `list` | list value |

This first version does not add generic parameter types such as `list<string>`
or named schema types. Preserve the type as a spanned AST enum so richer schema
integration can be added without changing fragment declaration syntax.

Substitution output remains string-only. Struct parameters are useful because a
fragment body can traverse string fields such as `{model.name}`. Non-string
primitive and list parameters can be forwarded to other fragments and checked,
but require future formatting or iteration features before they can be emitted
directly.

# How should fragment rendering resolve values and scope?

Render arguments are dotted data paths, matching existing substitutions. Evaluate
each path against the caller's current scope, then check the resulting
`ValueKind` against the declared parameter type before entering the fragment.

Inside a fragment:

- a path whose first segment matches a parameter starts from that parameter
- any other path starts from the root `DataSource`
- parameters shadow root fields with the same name
- nested fragment renders evaluate arguments in the current fragment scope

This gives templates access to shared root configuration without requiring it
to be threaded through every fragment, while keeping parameter shadowing
predictable.

# How should the AST change?

Extend `Template` with a fragment collection and add focused, fully spanned AST
types:

```rust
FragmentDefinition { name, parameters, body, span }
FragmentParameter { name, parameter_type, span }
FragmentRender { name, arguments, span }
NamedArgument { name, value_path, span }
ParameterType::{String, Boolean, Integer, Float, Struct, List}
```

Add `TemplateSegment::FragmentRender`. Fragment definitions should live on the
template root rather than as output segments because declarations do not render
at their source location. Preserve body segment spans and definition spans for
diagnostics.

# How should lexing and parsing change?

Add tokens for `@`, `fragment`, `render`, `end`, `:`, `=`, `,`, `(`, and `)` in
substitution mode. Reserve leading `@` for directives so ordinary `{path}`
substitutions remain unambiguous. Keywords must only match complete identifiers
within a directive, so paths such as `{record.end}` remain valid. Use `:` only
for parameter type declarations and `=` only for render argument binding.

Refactor the parser to distinguish:

- a dotted substitution path
- a fragment render identified by `@render`
- a fragment definition identified by `@fragment`
- a fragment terminator identified by `@end`

Parse fragment bodies recursively until `{@end}` while rejecting nested
`{@fragment}` directives. Keep escaped `{{` and `}}` behavior unchanged.

# What should be validated before rendering?

Build a fragment registry after parsing the complete template, then validate:

- fragment names are unique
- parameter names are unique within a fragment
- parameter type names are supported
- rendered fragments exist
- argument names are unique
- every parameter receives exactly one matching named argument
- renders do not provide unknown arguments
- direct or indirect recursive render cycles do not exist

Render directives may target fragments declared later because validation runs
after parsing. Recursion should be rejected with a diagnostic spanning the
participating render; an arbitrary runtime depth limit would make valid behavior
depend on data and hide a static template error.

# How should rendering change?

Separate parsing/validation from evaluation internally. The renderer should:

1. parse and validate the template
2. register all fragment definitions
3. render root segments in order
4. evaluate named render arguments in the caller scope
5. type-check argument values
6. render the fragment body with a parameter scope

Do not convert values to owned `NativeValue` merely to create a scope. Keep
borrowed `ValueView` values so custom `DataSource` implementations remain usable
without copying or exposing backend details.

Add structured `RenderError` variants for argument type mismatches and retain
the current data-path errors. Parse/validation errors should include the
narrowest fragment, parameter, argument, or render span available.

# How should errors be represented?

Add explicit parse or validation errors for:

- malformed fragment declarations and render directives
- unsupported parameter types
- missing `{@end}`
- nested fragment definitions
- duplicate fragments, parameters, and arguments
- unknown fragments and arguments
- missing arguments
- recursive renders

At render time, distinguish argument type mismatch from ordinary substitution
type mismatch. Include the parameter name, expected `ValueKind`, actual
`ValueKind`, and argument span.

# What documentation and examples should change?

Update the `joi-template` README and `docs/EXAMPLES.md` with one compact reusable
fragment example. Update the showcase or add a dedicated example that proves:

- a fragment can be declared after its render directive
- named arguments may be reordered
- a struct parameter supports dotted field traversal
- literal Rust braces still use `{{` and `}}`

The existing JOI API Rust generator does not need to consolidate its embedded
templates in this change. Its focused template files already avoid duplication;
forcing a migration would add churn without testing a missing capability.

# What implementation order is recommended?

1. Add spanned fragment, parameter, argument, render, and parameter-type AST nodes.
2. Extend substitution-mode lexing with fragment directive tokens and keyword rules.
3. Parse fragment definitions, named typed parameters, renders, and named path arguments.
4. Build post-parse fragment validation and recursive-cycle detection.
5. Add scope-aware path resolution over borrowed `ValueView` values.
6. Evaluate fragment renders with named argument binding and runtime type checks.
7. Add focused lexer, parser, validation, rendering, scope, and error tests.
8. Update README, examples, and public API documentation.
9. Run all workspace checks and an integration test using a Rust-shaped template.

# How will the work be verified?

Add colocated tests covering:

- zero, one, and multiple named typed parameters
- reordered named arguments
- renders before definitions
- nested renders and root-data fallback
- parameter shadowing
- every supported parameter type
- struct parameter field traversal
- escaped braces inside fragment bodies
- UTF-8 fragment, parameter, and rendered values where identifiers permit
- exact AST and error spans
- malformed syntax and missing `{@end}`
- duplicate, missing, extra, and unknown arguments
- unknown fragments and parameter types
- direct and indirect recursion
- runtime argument type mismatches
- compatibility with templates that contain no fragments

Run from `libs-rust/joi-template`:

```bash
cargo fmt --all --check
cargo test --workspace --all-targets --all-features
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo doc --workspace --no-deps
```

Because JOI API depends on `joi-template` by path, also run from
`libs-rust/joi-api`:

```bash
cargo test --workspace --all-targets
cargo clippy --workspace --all-targets -- -D warnings
```

All commands above passed on 2026-07-04. The template workspace ran 45 tests,
and the dependent JOI API workspace ran 36 tests including its generated-source
compilation test.

# What assumptions and risks remain?

- Fragment render arguments accept path expressions only; literals and computed
  expressions are future language features.
- Parameter typing uses coarse runtime kinds rather than full `DataType` schema
  validation. Connecting template fragments to named schemas should be designed
  with whole-template validation later.
- Fragments capture root data implicitly. If strict purity becomes important,
  the language may later require all dependencies as parameters.
- Rejecting recursion keeps evaluation bounded and diagnostics deterministic.
- Fragment definitions are local to one template. This is not an import/include
  mechanism and should not evolve into hidden filesystem access.
- Adding punctuation in substitution mode must not regress dotted substitutions
  or literal brace escaping.

# What changed during implementation?

- Fragment validation is part of `parse_template`, preserving the existing
  public parse API while ensuring renderers only receive statically valid calls.
- Runtime scopes retain borrowed `ValueView` instances; no native-value
  conversion or copying was introduced.
- The existing showcase was left unchanged because it demonstrates schema and
  data-source construction rather than repeated template output.

# What concrete tasks track completion?

- [x] Add fully spanned fragment-related AST nodes and parameter types.
- [x] Lex fragment directives and punctuation without breaking existing paths.
- [x] Parse fragment definitions with named typed parameters.
- [x] Parse fragment renders with named path arguments.
- [x] Validate signatures, named arguments, unknown renders, and recursion.
- [x] Add borrowed fragment scopes and runtime parameter type checks.
- [x] Render reusable fragment bodies and nested renders.
- [x] Add comprehensive lexer, parser, validation, rendering, span, and regression tests.
- [x] Update README, examples, and public API documentation.
- [x] Run all `joi-template` and dependent `joi-api` checks.
