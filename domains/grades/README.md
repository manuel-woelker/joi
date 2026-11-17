# Grades domain

Status: experimental model definitions. `Student` has a name and date of birth;
`Subject` has a name;
`Class` refers to sets of both, and `School Year` refers to classes.

The definitions use the shared [`@joi/domain`](../../libs-ts/joi-domain/README.md)
contract for primitive types, collections, references, and branded entity types.
No persistence, action execution, or UI integration is implemented yet.

`./n codegen` evaluates the definitions and writes `generated/model.json`, a
versioned runtime description with entity references represented by names.
The generated file is not committed. Runtime consumers can load the JSON
without executing TypeScript.

The Rust `joi-grades` plugin embeds that JSON at compile time and registers it
as a discoverable domain model. The combined `joix` server includes the plugin;
the model explorer shows its entities without treating them as storage tables.

From the repository root, run `./n grades-typecheck`. The shared contract has
its own `./n domain-typecheck` and `./n domain-test` tasks. All three are part
of `./n check`.
