# joix-tickets

`joix-tickets` is an experimental issue-tracker server plugin for JOI example
applications. Tickets represent bugs, tasks, and other work items rather than
user-support requests.

## What does the plugin own?

The plugin defines the project and ticket tables, provides representative data,
and registers those contributions for a host application. Applications compose
it by calling `joix_tickets::tickets_plugin()`.

The reusable [`joi-server`](../../libs-rust/joi-server/README.md) crate owns
application startup, HTTP and CLI command execution, generated command
contracts, redb entity persistence, Tantivy search, users, login sessions, and built-in commands.
This keeps transport and infrastructure behavior independent of the ticket
domain.

Projects contain an immutable KSUID `id`, name, description, and uppercase key
prefix. The default development projects are `Test` (`TEST`) and `Demo`
(`DEMO`).

The ticket table contains an immutable KSUID `id`, a human-readable
`<PROJECT>-<INTEGER>` key, a `project_id` referencing its project, title,
description, status, and an optional assignee referencing a server-managed
user. Fixture keys use the prefix of their associated default project.

## How are ticket keys and creation dates assigned?

Ticket inserts supply a project and normal record fields, but not `key` or
`creation_date`. The ticket mutation contributor assigns `<PREFIX>-<NUMBER>`
and an RFC 3339 UTC timestamp. Both fields are immutable, including for system
mutations. Ticket inserts cannot overwrite existing IDs; use updates instead.

Each project has a next-number counter in the private `ticket_project_counters`
KV bucket. It is not an entity table and cannot be queried, edited, or discovered
through public commands. Counter updates commit in the same transaction as the
ticket, dirty marker, and history. The exclusive datastore mutation lock prevents
concurrent allocations from racing. Failed pre-commit work consumes no numbers;
an index failure after commit still leaves the ticket and counter durable.

When a counter is first needed, it is seeded from the largest existing ticket
number, using authoritative KV data rather than result counts. Afterwards no
ticket scan is required unless the project's prefix changes. Deleting tickets never decrements the counter.
Changing a project's prefix checks for historical key collisions and affects new keys only; existing keys remain unchanged.
Projects need unique uppercase prefixes when creating tickets.

Older tickets retain their existing keys and have no creation date; no timestamp
is fabricated. Adding the date attribute rebuilds only the affected derived
Tantivy index on next startup. The UI offers Created in the column chooser and
omits generated values from the creation form.

## How do I check it?

Run the repository checks from the root:

```bash
./n check
```
