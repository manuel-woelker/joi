# @joi/domain

Status: experimental. This package defines the shared contract used by domain
declarations and by infrastructure that interprets them. It does not implement
storage, transport, UI, or action execution.

`defineEntity` returns a branded type reference. `Types` describes primitive,
set, and entity-reference attributes. Domains import this package; they do not
implement their own copies of these definitions.

Run `./n domain-typecheck`, `./n domain-test`, and `./n check` from the
repository root. The local `test/example-model.ts` exercises the contract
without depending on a domain package. See [domain architecture](../../docs/domain-architecture.md).
