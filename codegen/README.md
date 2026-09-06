# JOI Codegen

## What does this package do?

`joi-codegen` defines language-neutral command contracts in TypeScript and
generates matching TypeScript and Rust data types. It is private infrastructure
for keeping frontend and backend API shapes aligned; it does not generate
transport handlers or application behavior.

Author-written **declarations** use concise object literals and direct object
references. The model builder validates and normalizes them into immutable
**definitions** consumed by pure language generators.

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
./t nao codegen-generate
./t nao codegen-check
./t nao codegen-test
```

Generated TypeScript is written to `ui/src/generated/api`. Generated Rust is
written to `examples/joix-tickets/src/generated`. Both directories contain a
manifest identifying files owned by the generator.

`codegen-check` never modifies files. It reports missing, stale, or unexpected
manifest-owned output and asks the developer to regenerate it.

## What runtime does it require?

The package runs directly from erasable TypeScript source using the repository's
managed Node 26 runtime. Static checking uses the native TypeScript checker.
