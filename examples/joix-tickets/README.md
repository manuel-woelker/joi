# joix-tickets

`joix-tickets` is an experimental testbed for the main JOI libraries. It will
model a small issue tracker for bugs, tasks, and other work items.

## What does it exercise?

The crate currently provides basic project infrastructure only:

- a standalone Rust package
- a small in-process module abstraction and registry
- a default `TicketsModule` implementation
- an Axum service that exposes registered actions as typed JSON endpoints
- an SQLite-backed data store with schema setup, columnar queries, and atomic mutations
- a runnable `InfoAction` endpoint
- formatting, test, and lint commands

The example currently integrates the shared JOI base and error types.
Additional libraries and realistic workflows should be added incrementally as
their integration requirements become clear.

## How does the SQLite data store work?

`SqliteDataStore` can open a database file or create an isolated in-memory
database. It implements `DataStore`, creates missing tables and columns, maps
string and integer columns, and applies every step in a mutation within one
SQLite transaction. The first column in each table description is its primary
key. Identifiers are quoted before being included in SQL statements.

## How does the module registry work?

Modules implement the `Module` trait and provide a name, description, and
version through `ModuleInfo`. `ModuleRegistry` stores different module
implementations behind trait objects.

A module with a `Default` implementation can be registered by type:

```rust
let mut registry = ModuleRegistry::new();
registry.register::<TicketsModule>();
```

An already constructed module can instead be passed to `register_module`. The
current registry only owns and reports modules; lookup, lifecycle management,
and dependency handling are intentionally not implemented yet.

## How are actions exposed over HTTP?

`ActionRegistryBuilder::register` stores an action independently of any HTTP
framework. Names consist of `/`-separated path segments containing ASCII
letters, digits, `-`, and `_`; invalid or duplicate names are rejected during
registration with a string error. Building produces an immutable, cheaply
cloneable `ActionRegistry` and adds the built-in `actions/list` action from a
snapshot of the final descriptors.

Registration returns `JoiResult<()>`. Once registration is complete, an
`ActionService` is constructed from the registry and exposes every action at
both `POST` and `GET` `/api/<action-name>`. POST requests are deserialized from
JSON with serde. A GET request has no body, so the service invokes the action
with the JSON object `{}`. If the request type requires fields, the endpoint
returns a JSON `422` response. Successful responses are serialized as JSON.

`Action::execute` returns `JoiResult<Response>`. Failed actions are exposed as a
JSON `500 Internal Server Error` response whose `error` field contains the
current error context.

The executable currently registers `InfoAction` and listens on
`127.0.0.1:3000`. Its empty request is represented by JSON `{}`:

```bash
curl \
  --request POST \
  --header 'content-type: application/json' \
  --data '{}' \
  http://127.0.0.1:3000/api/info
```

The response has this shape:

```json
{"application_name":"joix-tickets","version":"0.1.0"}
```

The info action also accepts a bodyless GET request:

```bash
curl http://127.0.0.1:3000/api/info
```

The `actions/list` action returns the names and descriptions of all registered
actions in name order:

```bash
curl http://127.0.0.1:3000/api/actions/list
```

Action execution is synchronous for now. Long-running or blocking actions must
not be added until the action contract gains an asynchronous execution model or
explicit blocking-task dispatch.

## How do I run it?

From this directory:

```bash
cargo run
```

The executable registers `TicketsModule` and `InfoAction`, then runs the HTTP
service. It remains active until interrupted.

## How do I check it?

```bash
cargo fmt --all --check
cargo test
cargo clippy --all-targets -- -D warnings
```

## What is its status?

This crate is an internal, non-publishable example. It should stay small and
prefer realistic integration paths over becoming a second implementation of
the libraries it eventually demonstrates.
