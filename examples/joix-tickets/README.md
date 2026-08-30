# joix-tickets

`joix-tickets` is an experimental testbed for the main JOI libraries. It will
model a small issue tracker for bugs, tasks, and other work items.

## What does it exercise?

The crate currently provides basic project infrastructure only:

- a standalone Rust package
- a small in-process module abstraction and registry
- a default `TicketsModule` implementation
- an Axum service that exposes registered commands as typed JSON endpoints
- an SQLite-backed data store with schema setup, columnar queries, and atomic mutations
- passwordless user sessions transported by an HTTP-only cookie
- a runnable `InfoCommand` endpoint
- typed plugin extension registration through `joi-plugin`
- formatting, test, and lint commands

The example currently integrates the shared JOI base, error, and plugin types.
Additional libraries and realistic workflows should be added incrementally as
their integration requirements become clear.

## How are plugins composed?

At startup, the executable uses a `PluginRegistryBuilder` to register `infra`
and `tickets` plugins, then builds an immutable `PluginRegistry`. The
infrastructure plugin defines the `InfoProvider`, `TableDescriptionProvider`,
and `TestDataProvider` extension points and contributes package and
operating-system information. The tickets plugin contributes providers
describing and populating its `tickets` table.
Extension points are identified directly by trait-object types, and the
registry owns their implementations while exposing lock-free borrowed lookup.

`InfoCommand` owns the completed immutable plugin registry and asks every registered
`InfoProvider` to populate its response when the command runs. It does not know
which keys individual providers contribute, so adding another provider extends
the HTTP and CLI response without changing the command.

Each `TableDescriptionProvider` returns one owned table definition. The ticket
provider defines string columns for `id`, `title`, `description`, and `status`;
the first column is the primary key when passed to a `DataStore`.

Each `TestDataProvider` receives the configured `DataStore` and inserts its own
development records. In server mode, startup ensures every contributed table
before invoking the test-data providers. The tickets provider adds three sample
tickets representing open, in-progress, and closed work when the table is
empty. Application startup initializes the data store before selecting HTTP or
CLI command execution.

## How does the SQLite data store work?

`SqliteDataStore` can open a database file or create an isolated in-memory
database. It implements `DataStore`, creates missing tables and columns, maps
string and integer columns, enforces described foreign keys, and applies every step in a mutation within one
SQLite transaction. The first column in each table description is its primary
key. The server stores data at `examples/joix-tickets/joix-tickets.sqlite3`;
the database and its SQLite sidecar files are ignored by Git. Identifiers are
quoted before being included in SQL statements.

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

## How are commands exposed over HTTP?

`CommandRegistryBuilder::register` stores a command independently of any HTTP
framework. Names consist of `/`-separated path segments containing ASCII
letters, digits, `-`, and `_`; invalid or duplicate names are rejected during
registration with a string error. Building produces an immutable, cheaply
cloneable `CommandRegistry` and adds the built-in `commands/list` command from a
snapshot of the final descriptors.

Registration returns `JoiResult<()>`. Once registration is complete, an
`CommandService` is constructed from the registry and exposes every command at
both `POST` and `GET` `/api/<command-name>`. POST requests are deserialized from
JSON with serde. A GET request has no body, so the service invokes the command
with the JSON object `{}`. If the request type requires fields, the endpoint
returns a JSON `422` response. Successful responses are serialized as JSON.

## How does login work?

The development login is intentionally passwordless. `POST /api/login` accepts
one existing `user_id`, inserts a row into `user_sessions`, and returns the
selected user's public fields. The `session_id` primary key is an opaque,
256-bit cryptographically random token, and `user_id` has a SQLite foreign key
to `users.id`.

For HTTP clients, `CommandService` removes the session ID from the JSON response
and stores it in the `joix_session` cookie with `HttpOnly`, `Path=/`, and
`SameSite=Strict`. `GET /api/user-info` reads that cookie and returns the
associated `id`, `username`, and `name`; a missing or invalid session returns
`401 Unauthorized`. `POST /api/logout` deletes the current session and expires
the cookie. The cookie intentionally omits `Secure` for the current
plain-HTTP localhost server. A production HTTPS deployment must add it.

This is only a development identity mechanism. Sessions currently have no
expiry, revocation, or password verification, and other commands are not yet
authorization-gated.

`Command::execute` returns `JoiResult<Response>`. Failed commands are exposed as a
JSON `500 Internal Server Error` response whose `error` field contains the
current error context.

The executable currently registers `InfoCommand`, `PluginsCommand`,
`QueryCommand`, `MutateCommand`, `LoginCommand`, and `UserInfoCommand` and
listens on `127.0.0.1:3000`. The info command's empty
request is represented by JSON `{}`:

```bash
curl \
  --request POST \
  --header 'content-type: application/json' \
  --data '{}' \
  http://127.0.0.1:3000/api/info
```

The response has this shape:

```json
{
  "application_name": "joix-tickets",
  "architecture": "x86_64",
  "os": "linux",
  "os_family": "unix",
  "version": "0.1.0"
}
```

The OS values depend on the platform running the executable.

The info command also accepts a bodyless GET request:

```bash
curl http://127.0.0.1:3000/api/info
```

The `plugins` command accepts the same empty request and returns plugin names in
registration order:

```json
{
  "plugins": [
    {
      "name": "infra",
      "description": "Infrastructure services",
      "extension_points": [
        "info-providers",
        "table-descriptions",
        "test-data-providers"
      ],
      "extensions": ["package-info", "os-info"]
    },
    {
      "name": "tickets",
      "description": "Ticket management",
      "extension_points": [],
      "extensions": ["tickets-table", "ticket-test-data"]
    }
  ],
  "extension_points": [
    {
      "id": "info-providers",
      "description": "Contributes application information",
      "extensions": ["package-info", "os-info"]
    },
    {
      "id": "table-descriptions",
      "description": "Defines data-store tables",
      "extensions": ["tickets-table"]
    },
    {
      "id": "test-data-providers",
      "description": "Populates tables with development data",
      "extensions": ["ticket-test-data"]
    }
  ],
  "extensions": [
    {
      "id": "package-info",
      "description": "Provides package name and version"
    },
    {
      "id": "os-info",
      "description": "Provides operating-system information"
    },
    {
      "id": "tickets-table",
      "description": "Defines the tickets table"
    },
    {
      "id": "ticket-test-data",
      "description": "Adds representative tickets for development"
    }
  ]
}
```

The `query` command accepts a request analogous to `DataStoreQuery`. The table is
selected with `table_name`, so the same command can query any registered table.
Callers choose the table, criterion, result limit, and returned attributes:

```bash
curl \
  --request POST \
  --header 'content-type: application/json' \
  --data '{"table_name":"tickets","criterion":"match_any","max_results":100,"attributes":["id","key","title","description","status"]}' \
  http://127.0.0.1:3000/api/query
```

Results remain columnar and preserve each column's data type:

```json
{
  "number_of_hits": 3,
  "result_columns": [
    {
      "attribute": "id",
      "values": {
        "type": "string",
        "values": ["0o5Fs0EELR0fUjHjbCnEtdUwQe3", "0o5Fs0EELR0fUjHjbCnEtdUwQe4", "0o5Fs0EELR0fUjHjbCnEtdUwQe5"]
      }
    },
    {
      "attribute": "key",
      "values": {
        "type": "string",
        "values": ["TEST-1", "TEST-2", "TEST-3"]
      }
    }
  ]
}
```

The generic `mutate` command applies one or more insert, update, or delete steps in a
single datastore transaction. Columns use the same tagged string and integer
value representation as query results. Every column in an insert must have the
same number of values. Update columns must contain one value per ID:

```bash
curl \
  --request POST \
  --header 'content-type: application/json' \
  --data '{
    "steps": [
      {
        "insert": {
          "table_name": "users",
          "columns": [
            { "attribute": "id", "values": { "type": "string", "values": ["user-3"] } },
            { "attribute": "username", "values": { "type": "string", "values": ["alex.builder"] } },
            { "attribute": "name", "values": { "type": "string", "values": ["Alex Builder"] } }
          ]
        }
      },
      {
        "update": {
          "table_name": "users",
          "ids": ["user-3"],
          "columns": [
            { "attribute": "name", "values": { "type": "string", "values": ["Alex Engineer"] } }
          ]
        }
      }
    ]
  }' \
  http://127.0.0.1:3000/api/mutate
```

Updates identify rows through the table's first, primary-key column. Primary
keys are immutable, duplicate IDs and attributes are rejected, and a missing
ID fails the complete mutation. Delete steps contain a table name and
primary-key `ids`. A successful mutation returns `{}`.

The `commands/list` command returns the names and descriptions of all registered
commands in name order:

```bash
curl http://127.0.0.1:3000/api/commands/list
```

Command execution is synchronous for now. Long-running or blocking commands must
not be added until the command contract gains an asynchronous execution model or
explicit blocking-task dispatch.

## How do I run it?

From this directory:

```bash
cargo run
```

The executable registers `TicketsModule` and `InfoCommand`, then runs the HTTP
service. It remains active until interrupted.

Passing a command name invokes that command with an empty JSON object instead of
starting the HTTP service. The response is written as YAML and the process then
terminates:

```bash
cargo run -- info
cargo run -- commands/list
```

Only commands whose request can be deserialized from `{}` can currently be
invoked from the CLI. Unknown commands and extra command-line arguments produce
an error and a non-zero exit status.

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
