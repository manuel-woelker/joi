# joi-server

## How can plugins generate immutable fields and private state?

`MutationContributor::generated_attributes` declares server-owned columns.
The datastore rejects caller-supplied values for these columns on inserts and
updates, and allows them to be absent from insert requests.
`prepare_insert` receives the chunk's records before serialization, history, and
indexing. It can populate those fields using trusted mutation context and
authoritative read-only KV access through `MutationPreparation`.

`MutationPreparation::state` and `set_state` read and stage replaceable values in
the contributor's exclusively owned private buckets. Repeated sets retain the
last value. These writes share the entity/dirty/history transaction, under the
datastore's exclusive mutation lock. No write occurs if preparation fails, and
dirty replay never invokes preparation again. Use this for counters and similar
domain state; never perform external side effects in the hook. Regular
`contribute` entries remain append-only.

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
tables. A contributor declares the entity tables it applies to and its exclusively
owned auxiliary buckets. It receives actual old/new maps and changed attributes,
then adds entries through `MutationEntries`. Entries join the entity and dirty
marker writes in the same atomic transaction. Contributors cannot delete data,
overwrite existing auxiliary entries, or write to another contributor's buckets.
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
