# Joi UI

SolidJS workspace for creating and organizing customizable application views.

## How does the workspace work?

A saved view combines a reusable query with a reusable presentation. Queries
select and sort records; presentations define table or list layout, fields, and
density. The same definition can be shared by multiple views, or copied when a
view needs private customization.

The left navigation supports folders, favorites, reordering, moving,
duplication, deletion with undo, and keyboard navigation. View URLs use the
`#/views/<id>` hash format.

Workspace definitions are currently stored in browser `localStorage`. The
included reset command restores the example ticket workspace. Records are
loaded from the backend's `POST /api/query` command into a shared, validated,
columnar query-result model. Response-local branded row and column indexes
provide direct value access without converting flexible results into fixed
domain objects. Persisted configurations continue to use attribute names and
resolve them to column handles once per response.

Record-oriented screens use a shared master-detail editor over the same
columnar query result. Selecting a ticket or user keeps its table visible and
opens an edit pane on the right. Editor descriptors declare the table,
immutable identity attribute, labels, and text, multiline, or integer controls;
they do not require domain row types. Draft values remain local to the form.
A successful atomic `/api/mutate` update refetches the shared query once so the
table and editor display the same server-confirmed state. Record URLs use
`#/views/<view-id>/records/<record-id>` or
`#/administration/<entry-id>/records/<record-id>`.

The initial editor intentionally supports only string and integer fields. It
does not yet provide optimistic updates, dirty-field patches, conflict
detection, custom controls, or a normalized entity cache.

Tabular views use TanStack Table as a headless row and cell model over these
query results. Joi retains native table markup and its own styling. Sorting,
pagination, column resizing, selection, and virtualization are intentionally
deferred until their interaction requirements are clear. All backend HTTP
communication runs through the injectable `FetchService`. Permissions,
sharing, and workspace synchronization are not yet implemented.

UI capabilities can be added through the typed plugin registry during startup.
Plugin modules use the `*.plugin.ts` or `*.plugin.tsx` suffix and default-export
a plugin. Each plugin lives in its own directory under `src/plugins`; related
plugin families may be grouped one level deeper, as with `src/plugins/debug`.
Registrations, components, API clients, and tests stay in the owning plugin's
directory, while shared registry infrastructure remains in `src/plugins`. The application
bootstrap discovers plugin modules with Vite's eager
`import.meta.glob` support, then orders them by name; no central plugin import
list is maintained. Registry construction first invokes every plugin's
`registerExtensionPoints` callback, then invokes every `registerExtensions`
callback, so extensions do not depend on plugin discovery order.

Plugins declare required and provided services as typed records. Registry
construction validates providers, topologically sorts service dependencies,
detects missing services and cycles, initializes each plugin, and verifies that
every promised service was returned. Plugin callbacks receive only their
declared required and provided services.
The core plugin defines a `debug-contributions` extension point; its first
contribution displays the backend's `GET /api/info` response from the debug
control at the right edge of the status bar. Additional contributions display
plugins with their extension points and extension points with their nested
extensions from `GET /api/plugins`. Matching `UI Plugins` and
`UI Extension Points` contributions inspect the immutable client-side plugin
registry directly. Debug contributions declare an `info`, `frontend`, or
`backend` group and appear in that group order, alphabetically within each
group.

## How do I add a component demo?

The component playground is available at
`http://localhost:5173/#playground`. It eagerly discovers colocated files
ending in `*.demo.tsx`; no central registration list is required. Each file
default-exports a demo with a name, description, and one or more scenarios:

```tsx
export default {
  name: "Badge",
  description: "Compact labels for statuses and metadata.",
  scenarios: [
    { name: "Default", render: () => <Badge>Draft</Badge> },
    { name: "Success", render: () => <Badge tone="success">Ready</Badge> },
  ],
} satisfies ComponentDemo;
```

A scenario is one meaningful component state or configuration. Keep any
context wrapper or lightweight test double explicit in its `render` function.
Demo source paths and scenario names form reloadable playground hashes, so
renaming or moving a demo invalidates old deep links.

## How do I run it?

```sh
pnpm install
pnpm dev
```

During development, Vite proxies `/api` requests to the joix-tickets backend at
`http://127.0.0.1:3000`. Start that service separately with `nao joix-tickets`.

## How do I check and build it?

```sh
pnpm check
pnpm test
pnpm build
```

From the repository root, `nao ui` starts the same development server at
`http://localhost:5173`.
