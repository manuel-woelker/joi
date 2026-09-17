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

## How do I check it?

Run the repository checks from the root:

```bash
./n check
```
