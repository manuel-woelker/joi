# joi-server

`joi-server` is the reusable backend runtime for JOI applications. It owns
typed command dispatch, HTTP and CLI transports, SQLite persistence, plugin
introspection, application-model discovery, and the current user-session
implementation. Tables marked as discoverable are exposed through the typed
`model-info` command together with their attributes, types, keys, nullability,
and references.

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
