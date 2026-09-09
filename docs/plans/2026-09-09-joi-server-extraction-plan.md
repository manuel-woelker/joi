# Joi Server Extraction Plan

## What are we separating?

Extract the reusable backend runtime currently embedded in
`examples/joix-tickets` into a new library crate at `libs-rust/joi-server`.
The crate should own the complete server lifecycle, including application
startup, generated command contracts, HTTP transport, users, and login
sessions. Keep `joix-tickets` as a thin executable and the owner of
ticket-domain behavior.

`joi-server` is the recommended name. It describes the reusable server-side
runtime without claiming to be universal "core" infrastructure. Keep focused
modules inside this crate; splitting them into more crates before a second
consumer needs them would add package overhead without proving useful
boundaries.

The target ownership is:

```text
libs-rust/joi-server/src/
  command.rs
  command_handler.rs
  command_registry.rs
  command_service.rs
  data_store.rs
  sqlite_data_store.rs
  query_command.rs
  mutate_command.rs
  info_command.rs
  plugins_command.rs
  user_session_command.rs
  server.rs
  module.rs
  module_registry.rs
  generated/
  lib.rs

examples/joix-tickets/src/
  main.rs
  tickets_module.rs
```

Names may be grouped into submodules during implementation if that improves
navigation, but avoid a broad prelude or catch-all re-export surface.

## Where is the boundary?

Move code whose behavior belongs to the reusable server:

- typed `Command`, `CommandDescriptor`, and `CommandHandler` contracts;
- immutable command registry, registration checks, and `commands/list`;
- server startup, lifecycle orchestration, HTTP binding, and CLI/server mode
  selection;
- JSON-over-Axum command routing, error mapping, request logging, and CLI YAML
  output;
- datastore names, schemas, queries, mutations, provider traits, shared
  datastore ownership, and the SQLite implementation;
- generic `query`, `mutate`, info, and plugin-inspection commands;
- the user table, passwordless login/logout, user lookup, session persistence,
  cookie handling, and authentication-related HTTP behavior;
- generated request/response types, command implementations, and the runtime
  command inventory;
- the current module abstraction and registry, if it remains in use.

Keep only application and ticket-domain code in `joix-tickets`:

- ticket table descriptions and ticket development fixtures;
- ticket-specific plugins, extension registrations, and module metadata;
- application configuration supplied to `joi-server`, such as application
  name, version, listen address, database path, and additional providers;
- the minimal binary entry point that supplies configuration and invokes the
  server runtime.

The existing user table and its development users move with session handling
into `joi-server`. Ticket definitions may reference the server-owned users
table for assignees, but the server must not reference ticket tables or ticket
types in return.

## How should startup be exposed?

Expose one high-level server entry point driven by an explicit configuration
object, for example `Server::new(config)` followed by `run(arguments)`. The
exact naming can follow existing Rust conventions, but application-owned
choices must be visible rather than hidden in constants from `joix-tickets`.

The configuration should include:

- application name and version for info responses;
- listen address and SQLite database path;
- application plugins or a callback that contributes extensions, table
  descriptions, test data, and command handlers;
- an explicit development-data policy so reusable server startup does not
  silently populate fixtures in production.

`joi-server` should build the plugin registry, initialize its datastore,
register built-in handlers, validate the generated command inventory, select
CLI or HTTP execution, and report startup errors. `joix-tickets/main.rs` should
not manually reproduce these phases.

## How should HTTP and sessions be owned?

Move every HTTP concern into `joi-server`, including Axum routes, JSON request
and response conversion, status mapping, request logging, bodyless GET
handling, cookie parsing, cookie creation and expiry, and listener startup.

Session handling is part of this server contract for now. Keep login, logout,
and user-info command models and handlers beside the HTTP implementation, and
let the command service apply their cookie semantics internally. Do not expose
Axum, headers, cookies, or status codes to `joix-tickets`.

Preserve existing wire behavior during the extraction: command paths, empty
GET bodies, JSON errors, cookie attributes, authentication status codes, and
CLI YAML output must not change.

This intentionally couples the first `joi-server` API to the current user and
session model. Keep that coupling contained in focused identity/session
modules so authentication can later become configurable without affecting
ticket-domain code.

## Implementation Checklist

- [ ] Add `libs-rust/joi-server` with a focused manifest, `README.md`, public
      `lib.rs`, workspace membership, and only the dependencies required by
      extracted infrastructure.
- [ ] Move the command traits and registry into `joi-server`; preserve command
      name validation, descriptor checks, immutable snapshots, and the built-in
      `commands/list` behavior.
- [ ] Move `CommandService` and every HTTP concern into `joi-server`, including
      session-cookie behavior, response and error mapping, request logging, and
      listener startup.
- [ ] Move datastore contracts and `SqliteDataStore` into `joi-server`, keeping
      schema upgrades, nullable columns, foreign keys, query semantics, and
      atomic mutations unchanged.
- [ ] Move generic query, mutation, info, plugin-inspection, and module support;
      update internal imports and expose only APIs needed by consumers.
- [ ] Move the user table, user test data, login/logout/user-info commands,
      secure session ID generation, and `user_sessions` table into focused
      server-owned identity/session modules.
- [ ] Add the high-level server configuration and startup API. Move datastore
      initialization, built-in plugin and handler registration, generated
      inventory checks, CLI dispatch, and HTTP execution behind it.
- [ ] Update `joix-tickets` to depend on `joi-server`, delete moved source
      files, and leave `main.rs` responsible only for constructing server
      configuration, contributing ticket-owned providers, and invoking the
      server entry point.
- [ ] Change Rust code generation to write generated API code under
      `libs-rust/joi-server/src/generated/`. Generated Rust should import
      server runtime traits through stable crate-local paths.
- [ ] Update generated-file cleanup and Nao dependencies so server code is
      always regenerated before Rust checks, tests, and execution.
- [ ] Move infrastructure unit tests with their implementations. Replace tests
      that depend on ticket tables with small test-local schemas so
      `joi-server` never depends on `joix-tickets`.
- [ ] Keep generic end-to-end tests in `joi-server` for login cookies, CLI
      execution, startup composition, and generated handler completeness. Keep
      `joix-tickets` integration tests focused on ticket contributions and
      ticket queries through public server APIs.
- [ ] Update the root README, the new crate README, and the example README to
      explain the library/application boundary and standard commands.
- [ ] Wire the crate into shared formatting, Clippy, test, documentation, and
      CI tasks where existing workspace-wide tasks do not include it
      automatically.

## Verification

- [ ] Search `libs-rust/joi-server` for ticket-specific terms and ticket table
      fields; any occurrence must be justified test fixture text or removed.
      User and session terminology is expected.
- [ ] Run focused `joi-server` tests covering registry errors, GET `{}`
      handling, login/logout cookies, SQLite schema/query/mutation behavior,
      startup modes, and transport error mapping.
- [ ] Run `joix-tickets` tests and exercise ticket querying, mutation, login,
      logout, info, plugins, and CLI command execution through the extracted
      server.
- [ ] Run `./t nao check`.
- [ ] Restart active development tasks with `./t nao --restart`.

## Risks and Assumptions

- The extraction is behavior-preserving. Public API cleanup not required for
  the boundary should be a follow-up change.
- `SharedDataStore` remains lock-based. Changing concurrency or making
  datastore operations async would substantially widen this refactor.
- SQLite belongs in `joi-server` initially because it is the only reusable
  implementation of the datastore contract. Extract `joi-server-sqlite` only
  when another backend or feature split makes that useful.
- Generated command contracts and inventory are server-owned for now. Adding
  an application-specific command therefore requires extending the shared
  codegen model; revisit per-application inventories when a second server
  application makes that limitation concrete.
- The module registry overlaps conceptually with `joi-plugin`. Move it only if
  it still has an active consumer; otherwise remove it in a separately reviewed
  cleanup instead of publishing dead infrastructure.

## Open Questions

- Should callers provide a completed `PluginRegistry`, a list of plugins, or a
  registration callback in `ServerConfig`? Prefer a callback if the server must
  define built-in extension points before application plugins contribute
  extensions, and document registration order explicitly.
- Which built-in command handlers should always be enabled? The plan assumes
  command listing, info, plugins, query, mutation, login, logout, and user info
  are part of the initial server contract.
- Should development user fixtures be enabled independently from application
  fixtures? Defaulting either one on in a reusable server crate is unsafe; the
  plan assumes startup configuration makes both choices explicit.
