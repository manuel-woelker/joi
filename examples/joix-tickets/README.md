# joix-tickets

`joix-tickets` is an experimental issue-tracker application and integration
testbed for the JOI libraries. Tickets represent bugs, tasks, and other work
items rather than user-support requests.

## What does the application own?

The application is intentionally thin. It defines the project and ticket
tables, provides representative data, registers those contributions as a
plugin, and supplies `joi-server` with application metadata and runtime
configuration.

The reusable [`joi-server`](../../libs-rust/joi-server/README.md) crate owns
application startup, HTTP and CLI command execution, generated command
contracts, SQLite persistence, users, login sessions, and built-in commands.
This keeps transport and infrastructure behavior independent of the ticket
domain.

Projects contain an immutable KSUID `id`, name, description, and uppercase key
prefix. The default development projects are `Test` (`TEST`) and `Demo`
(`DEMO`).

The ticket table contains an immutable KSUID `id`, a human-readable
`<PROJECT>-<INTEGER>` key, a `project_id` referencing its project, title,
description, status, and an optional assignee referencing a server-managed
user. Fixture keys use the prefix of their associated default project. The
physical `project_id` column is nullable so existing development databases can
receive it through additive schema upgrades; fixture initialization associates
legacy unassigned rows by key prefix.

## How do I run it?

From the repository root, run:

```bash
./n joix-tickets
```

The server listens on `http://127.0.0.1:3000` and exposes commands at
`/api/<command-name>`. Passing one command name runs it through the CLI and
prints YAML instead of starting HTTP:

```bash
./t cargo run -p joix-tickets -- info
```

The SQLite database is stored at
`examples/joix-tickets/joix-tickets.sqlite3` and is ignored by Git.

## How do I check it?

Run the repository checks from the root:

```bash
./t nao check
```
