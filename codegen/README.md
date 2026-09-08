# JOI Codegen

## What does this package do?

`joi-codegen` defines language-neutral command contracts in TypeScript and
generates matching TypeScript and Rust data types. It is private infrastructure
for keeping frontend and backend API shapes aligned; it does not generate
transport handlers or application behavior.

Author-written **declarations** use concise object literals and direct object
references. The model builder validates and normalizes them into immutable
**definitions** consumed by pure language generators.

## How is the package organized?

Author-owned API descriptions live in `src/declarations`, concrete language
generators live in `src/generators`, and generation targets live in
`src/codegen.config.ts`.

Reusable codegen infrastructure lives in `src/engine`. This includes the model
declaration API, normalized definitions, discovery, generator support, source
formatting, and output synchronization. Keep application-specific commands and
language-specific rendering outside the engine.

## How do I add a command?

Add a `*.command.ts` module under `src/declarations` and default-export a
command declaration:

```ts
const Response = defineStruct({
  name: "ExampleResponse",
  description: "An example response.",
  fields: [{ name: "message", type: stringType, description: "The returned message." }],
});

export default defineCommand({
  id: "example",
  description: "Return an example response.",
  request: defineStruct({ name: "ExampleRequest", description: "An empty request.", fields: [] }),
  response: Response,
});
```

Put reusable type declarations in ordinary modules and import the same object
from each command that uses it. Discovery uses `node:fs/promises.glob`; no
central registration list or build-time bundle is required.

## How do I add a generator?

Add a `*.generator.ts` module under `src/generators` and default-export a value
created with `defineGenerator`. A generator receives the complete immutable
model and returns source files. It must not access or modify the filesystem.

Filesystem destinations, formatting, manifests, and atomic writes belong to
the generation runner.

## How do I generate and verify output?

Run commands from the repository root:

```sh
./t nao codegen
./t nao codegen-check
./t nao codegen-clean
./t nao codegen-test
```

Generated TypeScript is written below `ui/src/generated`. Generated Rust is
written to `examples/joix-tickets/src/generated`. Both generated roots contain
a manifest identifying files owned by the generator.

Generated output is ignored by Git. Consumer tasks depend on `codegen`, so a
clean checkout creates the required files before compiling or testing.
`codegen-check` verifies the current output without modifying it. Every
generation starts by removing all configured output folders. `codegen-clean`
performs only that cleanup. For safety, cleanup rejects roots not named
`generated`; never place handwritten files in these directories.

## What runtime does it require?

The package runs directly from erasable TypeScript source using the repository's
managed Node 26 runtime. Static checking uses the native TypeScript checker.
