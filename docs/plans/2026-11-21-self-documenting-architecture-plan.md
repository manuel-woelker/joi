# Self-Documenting Architecture

## What is the goal?

Let running software components describe their architecture and expose the
result as a JSON graph. Keep the descriptions with the components so they can
reflect the configuration and metrics of the running application.

## How do components describe themselves?

Add an independent `joi-architecture` crate to the Rust workspace. Its
`ArchitectureComponent` trait has one method, `describe`, which receives a
mutable `ArchitectureContext`. A component supplies a stable instance ID,
label, and description in one registration call. The registration takes a
closure that contributes named JSON configuration values, numeric metric
snapshots, and directed relationships to other components.

Components delegate through the context so it can record each relationship and
register the target before expanding its details. The collector emits shared
components once, terminates cycles, and rejects conflicting ID claims. Each
description contributes exactly one component. Sort nodes by ID and
relationships by kind and target ID.

## What does the JSON API return?

Expose a top-level `components` array. Each entry contains `id`, `label`, and
`description`. Include `config`, `metrics`, and `relationships` when populated.
Relationships carry `kind` and `target_id` and refer to components in the same
response.

Register an `architecture` command in `joi-server` alongside `info` and
`plugins`. Collect a fresh graph from the server, its plugin registry, and its
live data store on each request. Use explicitly selected application
configuration and inexpensive in-memory counts. The existing command service
exposes the response at `GET /api/architecture`.

## How will the implementation be verified?

Document the crate API and standard commands in its README. Test JSON output,
delegation, shared targets, cycles, duplicate IDs, and omitted optional fields.
Exercise the JSON endpoint through the existing command service and verify that
each relationship target exists in the response. Run the affected package tests,
`./n check`, and `./n --restart`.
