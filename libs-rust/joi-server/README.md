# joi-server

## How can plugins generate immutable fields and private state?

`MutationContributor::configure` runs once per table during schema registration.
It returns a cached handler, server-owned columns, owned buckets, and execution
order, or `None` when the contributor does not apply.
The datastore rejects caller-supplied values for these columns on inserts and
updates, and allows them to be absent from insert requests.
The handler has one method: `ChunkMutationContributor::contribute`. It receives
the whole single-table chunk before serialization and indexing. `add_column`
adds or replaces values in row order; `None` leaves a row untouched, while
`Some(Value::Null)` explicitly clears a nullable field. Old/current rows are
available for inspection and `changes()` computes the current diff. Identity,
row count, and schema types are validated. Authoritative read-only KV access
and private state writes are available through `MutationPreparation`.

`MutationPreparation::state` and `set_state` read and stage replaceable values in
the contributor's exclusively owned private buckets. Repeated sets retain the
last value. These writes share the entity/dirty/history transaction, under the
datastore's exclusive mutation lock. No write occurs if preparation fails, and
dirty replay never invokes preparation again. Use this for counters and similar
domain state; never perform external side effects in the hook. Regular
`contribute` entries remain append-only.

## How are entity timestamps maintained?

Schemas declaring string columns `creation_date` and/or `update_date` automatically
use the built-in `TimestampContributor`. Both are server-owned. Creation sets both;
actual updates change only `update_date`. No-op updates leave timestamps unchanged.
Use nullable columns when adding them to existing data; old dates are not invented.

Handlers run in `Domain`, `History`, then `Metadata` order, regardless of plugin
registration order (ties preserve registration order). Ticket keys are domain
columns; timestamps are metadata columns. History therefore includes generated
ticket keys but not timestamp changes. All columns are applied before final
validation and a single serialization for storage and indexing. Tables without
timestamp columns have no timestamp handler, and no mutation rescans the schema
to select contributors or discover timestamp attributes.

`joi-server` is the reusable backend runtime for JOI applications. It owns
typed command dispatch, HTTP and CLI transports, entity persistence, search,
plugin introspection, application-model discovery, and the current user-session
implementation. Entity bytes and binary IDs are stored in redb. A derived
Tantivy index handles all row queries, filtering, sorting, and aggregations and
is repaired from durable dirty entries during startup (or rebuilt when missing
or interrupted). Tables marked as discoverable are exposed
through the typed `model-info` command together with their attributes, types,
keys, nullability, and references.

redb is authoritative. Mutations commit there before updating Tantivy because
the two engines cannot share a transaction. An indexing failure is returned to
the caller, and the next startup repairs the derived index by rebuilding it
from the affected stored entities. Each chunk commits entities and one dirty
marker in one KV transaction; successful indexing then removes the marker.

The low-level entity store accepts opaque binary IDs and values. Batched
mutations can optionally return the complete post-mutation `Entity` values;
the coordinator uses those values to update Tantivy without reconstructing
partial records.

The crate is experimental and currently intended for workspace applications.
Applications configure the server and contribute domain-specific plugins;
they do not need to implement transport or startup plumbing.

## How do I check it?

From the repository root, run:

```bash
./t cargo test -p joi-server
./t cargo clippy -p joi-server --all-targets -- -D warnings
```

Repository-wide checks are available through `./t nao check`.

## How do mutation contributors work?

Plugins register `dyn MutationContributor` extensions under `mutation-contributors`.
Install the registry with `IndexedDataStore::set_contributors` before preparing
tables. Configuration binds each contributor to its applicable tables and
exclusively owned auxiliary buckets. Handlers can add mutation columns and add
entries through `MutationEntries`. Entries join entity, private-state, and dirty
marker writes in the same atomic transaction. Append-only entries cannot
overwrite existing keys; replaceable state uses `MutationPreparation::set_state`.
Neither can write to another contributor's buckets.
They must not recursively call the store or perform external side effects.

Call `DataStore::mutate` with a `MutationContext` derived from trusted command
user information, or `MutationContext::system()` for server-initiated work.
Never derive attribution from request JSON. The reserved user ID `system` is not
a real account and cannot be used for login. HTTP `mutate` and `entity-history`
requests require a session; direct CLI/startup mutation callers can use System.

## How is entity history stored and read?

The tickets plugin enables `HistoryContributor` for tickets and projects. Each
changed entity gets one entry in `history_<table>`, keyed by
`<entity KSUID>:<history KSUID>`. Entries contain a non-null `userid`, UTC timestamp,
entity ID, operation, and sorted attribute changes. Missing old/new attributes
are omitted; a present JSON null stays null. Equal updates and absent deletes
produce no entries. Insert-overwrite records the actual Update rather than Create.

`entity-history` takes `table`, `entity_id`, optional `limit` (default 50, cap 200),
and optional `cursor`. Pages use bounded redb prefix scans in descending KSUID
order. KSUIDs are only approximately chronological within one second. Deleted
entities' history remains readable; old rows are not backfilled when history is
enabled. History is never indexed by Tantivy or exposed through generic queries.

History survives an indexing failure because the entity transaction has already
committed. Startup repair and index rebuilds do not invoke contributors, preventing
duplicate history. Later chunk failures do not roll back earlier chunks. A failed
HTTP response is therefore not proof that no data was committed. History retains
deleted content indefinitely for now; retention and sensitive-field exclusions
are separate policy decisions.

## How is entity metadata shared with the UI?

`TableDescription.presentation` contains server-owned labels, a label template,
an icon name, ordered field presentation, create defaults, facets, and declarative
validation. Storage column definitions supply authoritative types, nullability,
identity and references. `model-info` returns both pieces without duplicating the
physical schema. Models without presentation metadata remain discoverable and
read-only in generic clients. Non-discoverable tables are still omitted.

Use `model_metadata::field` and its builder methods to describe fields. Required
and regex rules are compiled once by `IndexedDataStore::ensure_tables`. Each
mutation chunk validates the complete resulting entities, including generated
columns, before writing its entity, contributor and dirty entries transactionally.
An invalid chunk writes nothing; earlier completed chunks keep the existing
commit semantics. Deletes and index replay do not revalidate historical data.
Existing invalid records can be read, but must satisfy the rules when updated.

Rules are also exposed for immediate form feedback, but client validation is never
trusted. Patterns must use the shared Rust/JavaScript Unicode regex subset.
UI controls are declarative; icons are symbolic names resolved by clients, and
default strategies are literals or KSUID generation rather than serialized code.
