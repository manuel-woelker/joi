# joi-server

`joi-server` is the reusable backend runtime for JOI applications. It owns
typed command dispatch, HTTP and CLI transports, entity persistence, search,
plugin introspection, application-model discovery, and the current user-session
implementation. Entity bytes and binary IDs are stored in redb. A derived
Tantivy index handles all row queries, filtering, sorting, and aggregations and
is rebuilt from redb during startup. Tables marked as discoverable are exposed
through the typed `model-info` command together with their attributes, types,
keys, nullability, and references.

redb is authoritative. Mutations commit there before updating Tantivy because
the two engines cannot share a transaction. An indexing failure is returned to
the caller, and the next startup repairs the derived index by rebuilding it
from the complete stored entities.

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

Benchmarks comparing JSON, bincode, and FlatBuffers encoding of columnar
query results (speed and encoded size, using ticket-shaped data) run with:

```bash
./t cargo bench -p joi-server --bench attribute_columns
```

Repository-wide checks are available through `./t nao check`.
