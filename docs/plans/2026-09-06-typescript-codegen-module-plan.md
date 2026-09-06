# TypeScript Code Generation Module Plan

## What are we building?

Add a top-level `codegen` pnpm workspace package that defines a shared,
language-neutral API model and generates source files for consumers such as the
SolidJS frontend and Rust backend. The package runs under Node and keeps three
responsibilities separate:

- **model declarations** describe commands, request and response shapes, and
  reusable named types;
- **generators** translate one validated model into target-specific source
  files;
- **infrastructure** discovers contributions, validates and assembles the
  model, selects generators, and safely writes or checks generated output.

Start with a narrow end-to-end slice that can express records, enums, aliases,
optional/list values, commands, request types, and response types. Generate
TypeScript declarations for the UI and Rust `serde` data types for the backend.
Do not generate command handlers, transport routing, persistence logic, or UI
components in the first iteration.

The implementation is complete. The initial `get-ticket` declaration exercises
every supported type shape, and committed TypeScript and Rust output is checked
end to end by the codegen test suite and repository checks.

## Where should the package live?

Create `codegen/` as an independently understandable private workspace package:

```text
codegen/
  package.json
  README.md
  tsconfig.json
  vite.config.ts
  src/
    model/
      declarations.ts
      definitions.ts
      model-builder.ts
      model-validation.ts
    declarations/
      core.command.ts
    generators/
      typescript.generator.ts
      rust.generator.ts
    discovery/
      discover-command-declarations.ts
      discover-generators.ts
    generation/
      generated-file.ts
      generation-runner.ts
      output-writer.ts
    cli.ts
```

Add `codegen` to `pnpm-workspace.yaml`. Keep this package independent from the
browser UI and from the existing Rust `joi-api-generator`; they solve related
but currently distinct problems. The TypeScript module models application
contracts authored as TypeScript, while `joi-api-generator` parses the textual
JOI API language. A future adapter may translate the JOI API AST into this
shared model after both representations have stable semantics.

## What should the shared model contain?

Call the ergonomic objects written by contributors **declarations** and the
validated objects consumed by generators **definitions**. Declarations accept
plain strings and concise object literals. The model builder converts them into
immutable definitions with branded command, type, field, and generator IDs so
internal code cannot mix identifier kinds accidentally.

Declarations reference concrete type objects rather than names that require a
later resolution pass:

```ts
type TypeId = string & { readonly typeIdBrand: unique symbol };
type CommandId = string & { readonly commandIdBrand: unique symbol };

interface FieldDeclaration {
  readonly name: string;
  readonly type: TypeDeclaration;
  readonly description: string;
}

interface CommandDeclaration {
  readonly id: string;
  readonly description: string;
  readonly request: StructDeclaration;
  readonly response: TypeDeclaration;
}

interface CommandDefinition {
  readonly id: CommandId;
  readonly description: string;
  readonly request: StructDefinition;
  readonly response: TypeDefinition;
}
```

Create type declarations with `defineStruct`, `defineEnum`, `defineAlias`,
`optional`, and `list`. These authoring helpers accept plain names. Struct
fields are an array of `{ name, type, description }` objects; do not require a
`defineField` helper. `defineCommand` likewise accepts a plain command ID, so
there is no public `commandId` constructor. Commands hold request and response
objects, including an empty struct when there is no payload; avoid special
`void`, untyped JSON, transport-specific semantics, and string-based type
references.

Named declarations still provide stable semantic names for diagnostics and
generated names. Object identity represents reuse: multiple commands can import
and use the same `User` declaration. If distinct declarations claim the same
semantic name, validation rejects them rather than merging them. The builder
traverses command roots, deduplicates declarations by identity, assigns branded
IDs, and creates the flat deterministic definition order consumed by generators.

Authoring helpers freeze declarations and perform cheap local checks. The model
builder validates the complete declaration graph for duplicate semantic names,
blank descriptions, duplicate fields and enum values, cycles, and
target-independent naming hazards. It then produces deeply frozen definitions.
Generators must not mutate the normalized model or rediscover its graph.

Direct objects make recursive definitions impossible without indirection.
Reject cycles initially. Add an explicit typed `lazyType(() => Node)` only when
a real recursive API requires it; falling back to names would discard the main
type-safety benefit.

Keep source-location metadata on normalized definitions optional. Discovery
attaches declaration file paths for actionable errors; byte spans are not
useful when declarations are ordinary TypeScript objects rather than parsed
source text.

## How should declarations be discovered?

Each `*.command.ts` module default-exports a `CommandDeclaration` whose type
graph is rooted directly in its request and response:

```ts
export default defineCommand({
  id: "info",
  description: "Return application information.",
  request: defineStruct({ name: "InfoRequest", fields: [] }),
  response: defineStruct({
    name: "InfoResponse",
    fields: [
      {
        name: "applicationName",
        type: stringType,
        description: "The name of the application.",
      },
    ],
  }),
});
```

Shared declarations are ordinary exported objects imported by command modules.
Discover commands at runtime with Node's stable promise-based glob API and
dynamic ESM imports:

```ts
import { glob } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const paths: string[] = [];
for await (const path of glob("src/declarations/**/*.command.ts", { cwd: packageRoot })) paths.push(path);
for (const path of paths.sort()) {
  const module = await import(pathToFileURL(resolve(packageRoot, path)).href);
  // Validate module.default as a CommandDeclaration.
}
```

Collect and sort paths before importing so filesystem order cannot affect
module execution or generated output. Validate every default export and include
its source path in diagnostics. Declarations must not self-register through
module side effects or global mutable state.

The initial glob covers declarations owned by `codegen`. Configurable workspace
roots can be added later; resolve every result against its configured root and
reject paths outside that root before importing it.

## How should generators be defined and discovered?

Each `*.generator.ts` module default-exports one generator:

```ts
interface CodeGenerator {
  readonly id: GeneratorId;
  readonly label: string;
  readonly description: string;
  generate(model: ApiModel): readonly GeneratedFile[];
}

interface GeneratedFile {
  readonly relativePath: string;
  readonly contents: string;
}
```

Use a second `node:fs/promises` glob and dynamic imports for generator
discovery. Validate metadata and reject duplicate generator IDs before running
any generator.
Generators are pure transformations: they return normalized relative paths and
UTF-8 contents but never read configuration, inspect the filesystem, or write
files. Shared naming and escaping functions may live beside a target generator;
do not add a generic template abstraction until both generators need the same
behavior.

The TypeScript generator should emit deterministic exported interfaces/types
and command request/response mappings. The Rust generator should emit
deterministic owned structs/enums with `serde::{Serialize, Deserialize}` derives
and command-name constants. Include generated-file headers and stable trailing
newlines. Format generated TypeScript with Biome and Rust with `rustfmt` as an
explicit runner stage, not from generator internals.

## How should discovery and TypeScript execution work under Node?

Use `glob` from `node:fs/promises`, which is stable in the repository's managed
Node 26 runtime. This removes Vite-specific discovery and makes newly added
definitions and generators visible without rebuilding a bundle. Import each
discovered `.ts` file using an absolute file URL.

Run TypeScript source directly with Node's built-in type stripping. Keep runtime
source within erasable TypeScript syntax, use explicit `.ts` extensions for
relative imports, and enable `erasableSyntaxOnly` and
`allowImportingTsExtensions`. Do not use TypeScript enums, parameter properties,
runtime namespaces, JSX, or path aliases that Node cannot resolve. Running
`tsgo --noEmit` remains mandatory because Node strips types but does not check
them.

Add package scripts along these lines:

```json
{
  "check": "tsgo --noEmit",
  "generate": "node src/cli.ts generate",
  "check-generated": "node src/cli.ts check",
  "test": "vitest run"
}
```

The repository Nao tasks should invoke managed tools directly, following the
existing setup: one `codegen-typecheck` task, one `codegen-generate` task, and
one `codegen-check` task. `codegen-check` depends on typechecking and verifies
outputs without modifying them; add it to the repository `check` task. Keep
explicit generation separate so ordinary checks cannot rewrite developer files.

## How should generation and output behave?

Give the CLI explicit checked-in configuration mapping generator IDs to output
roots. Do not let definition modules choose filesystem destinations. The runner
should:

1. discover command declarations;
2. validate and normalize them into one immutable definition model;
3. discover and validate generators;
4. select configured generators in deterministic ID order;
5. collect every `GeneratedFile` before touching disk;
6. reject absolute paths, `..` traversal, duplicate outputs, and output-root
   escapes;
7. format outputs and fail with the generator and path when formatting fails;
8. write changed files atomically in `generate` mode;
9. compare exact contents and report stale, missing, and unexpected generated
   files in `check` mode.

Use a manifest owned by each output root to identify files generated by this
tool. Delete stale files only when they appear in the previous manifest; never
delete an output directory wholesale. Skip writes when contents are unchanged
to preserve timestamps and avoid unnecessary frontend/backend rebuilds.

Initially write TypeScript under `ui/src/generated/api/` and Rust under
`examples/joix-tickets/src/generated/`, with small handwritten module boundary
files if required by each language. Generated files should be committed so the
frontend and backend can build without first bootstrapping the generator.

## Implementation Checklist

- [x] Add the private `codegen` package to the pnpm workspace with Node ESM,
      native TypeScript checking, Vitest, and package documentation.
- [x] Define ergonomic declaration and normalized definition shapes for
      built-ins, structs, enums, aliases, fields, commands, and the API model;
      brand identifiers only in definitions.
- [x] Add frozen `defineStruct`, `defineEnum`, `defineAlias`, `defineCommand`,
      optional, and list authoring helpers accepting plain strings and field
      object arrays, plus graph normalization and source-aware diagnostics.
- [x] Add one or more representative command declaration modules using the
      `*.command.ts` convention.
- [x] Implement deterministic command discovery with `node:fs/promises.glob`,
      safe file-URL imports, root containment checks, and export validation.
- [x] Define the pure generator and generated-file contracts.
- [x] Implement deterministic `*.generator.ts` discovery with Node glob and
      reject invalid or duplicate generators.
- [x] Add an initial TypeScript generator for shared DTO declarations and
      command request/response mappings.
- [x] Add an initial Rust generator for serde DTOs and command-name constants.
- [x] Implement configured output roots, path validation, duplicate detection,
      atomic changed-only writes, generated manifests, and conservative stale
      file cleanup.
- [x] Add `generate` and non-mutating `check` CLI modes with concise diagnostics
      and non-zero exit codes on invalid models or stale output.
- [x] Configure direct TypeScript execution under managed Node with erasable
      syntax and Node-resolvable imports.
- [x] Add target formatting stages using repository-managed Biome and rustfmt.
- [x] Add Nao typecheck, test, generate, and generated-output check tasks; include the
      non-mutating check in `nao check` and CI.
- [x] Add unit tests for constructors, model validation, discovery ordering,
      malformed modules, generator selection, output path safety, manifests,
      stale detection, and changed-only writes.
- [x] Add golden tests for TypeScript and Rust output and compile/typecheck the
      generated fixtures.
- [x] Document how to add a command declaration, add a generator, regenerate
      outputs, and diagnose stale generated files.
- [x] Run `nao check` and restart active development tasks with `nao --restart`.

## How will we verify it?

- Reordering glob results does not change the assembled model or any
  generated bytes.
- Invalid declarations report the contribution path, offending identifier, and
  all relevant duplicate/reference locations.
- Both generators consume the same frozen model and produce no filesystem side
  effects directly.
- The generated TypeScript passes the UI typecheck and the generated Rust passes
  workspace formatting, Clippy, and tests.
- Running generation twice leaves file contents and modification times
  unchanged on the second run.
- `check` reports stale, missing, modified, and unexpected generated files
  without changing the working tree.
- Malicious or accidental absolute and parent-relative output paths cannot
  escape configured roots.
- A clean checkout can install dependencies, run the TypeScript source with
  managed Node, verify generated output, and run all checks through Nao.

## What assumptions and risks remain?

- The first model is intentionally smaller than the JOI API language. Adding
  streaming, errors, generics, transport metadata, or recursive structural
  types before a concrete command needs them would overengineer the model.
- Command declarations are trusted build-time TypeScript and may execute code
  when eagerly imported. Repository review and CI are the security boundary;
  this is not a sandbox for third-party schemas.
- Dynamic imports execute trusted top-level module code. Path and export
  validation do not make third-party declarations or generators sandboxed.
- Direct object references provide stronger authoring safety but do not support
  recursive types initially. Add typed lazy references rather than names when
  recursion becomes necessary.
- Rust and TypeScript naming rules differ. The normalized model should preserve
  semantic IDs while each generator owns target naming, escaping, and collision
  diagnostics.
- Committing generated files improves consumer ergonomics but creates stale-file
  risk; the mandatory non-mutating CI check is what makes that tradeoff safe.
- Removing generated files must remain manifest-scoped. Treating an output
  folder as disposable could delete handwritten integration code.
- The initial backend output location assumes `joix-tickets` is the first
  integration target. If generated contracts should instead become a reusable
  Rust crate, decide that before implementing the Rust output configuration.

## What should be decided before implementation?

- Confirm whether the first command fixture should model existing `info`,
  `query`, and `mutate` contracts or introduce a smaller isolated example.
- Confirm whether generated Rust belongs directly in `joix-tickets` or in a new
  reusable library consumed by it.
- Confirm whether generated files are committed. This plan recommends yes,
  paired with `codegen-check` in CI.
