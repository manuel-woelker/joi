# joix

`joix` is the combined example server application for the JOI workspace. It
composes the Tickets and Codevette domain plugins with the reusable
`joi-server` runtime.

## How do I run it?

From the repository root, run:

```bash
./n joix
```

The server listens on `http://127.0.0.1:3000`. Passing one command name runs it
through the CLI and prints YAML instead of starting HTTP:

```bash
./t cargo run -p joix -- info
```

The redb entity database is stored at `examples/joix/data/joix.redb`. The derived
Tantivy index is stored under `examples/joix/data/joix.search`. Both live under
the git-ignored `data/` directory; delete it to reset local state.

## How do I check it?

```bash
./n check
```
