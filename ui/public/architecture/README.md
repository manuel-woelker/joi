# Architecture viewer

## How do I deploy it?

Vite serves this directory under `/architecture/` during development and copies
it into the UI build. In the main UI, open **Debug → Architecture** to launch it
in a new tab.

For a standalone deployment, copy this directory to your server.

Serve the copy with a static HTTP server at any path on the same origin
as the JOI API. For example, map it to `/architecture/` and forward
`/api/architecture` to the JOI server. Use the trailing slash when opening the
viewer at a directory URL. The viewer has no build step or runtime dependencies
outside this directory and the API.

## What does it show?

The viewer loads a snapshot from `GET /api/architecture`. Select a component to
inspect its description, configuration, metrics, and incoming and outgoing
relationships. Search highlights matching components while keeping the graph
visible. Refresh requests a fresh snapshot.
