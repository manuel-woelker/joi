# Joi UI

SolidJS workspace for creating and organizing customizable application views.

On startup the UI requests `GET /api/user-info`. A valid HTTP-only session
opens the workspace; otherwise a passwordless login view loads the available
users and asks the visitor to select one. Successful login sets the backend
session cookie and retries user-info before mounting application state.
The current user's name opens an account menu; Logout revokes the backend
session and returns to the same login flow.

## How does the workspace work?

A saved view combines a reusable query with a reusable presentation. Queries
select and sort records; presentations define table or list layout, fields, and
density. The same definition can be shared by multiple views, or copied when a
view needs private customization.

The left navigation is an accordion with an editable **My workspace** tree, a
flat list of the eight most recently used views, and plugin-contributed system
trees. Workspace folders and views support drag reordering, context-menu moves,
duplication, deletion with undo, and keyboard navigation. Every system or recent
leaf can be copied through its context menu or dragged into My workspace. Query
views become editable copies; other destinations, such as administration views,
become persistent workspace shortcuts. Routes encode their navigation origin
directly: `#/workspace/<view-ksuid>` for workspace entries,
`#/<system-section>/<leaf-id>` for system views, and
`#/recent/<section>/<leaf-id>` when opened from Recently used. This keeps
selection state independent even when routes resolve to the same content.

Workspace definitions are currently stored in browser `localStorage`. Domain
plugins contribute namespaced default queries, presentations, views, and
navigation entries. The v4 workspace schema removes favorites and retains
branded entity IDs; existing v2 and v3 workspaces are migrated without replacing
user definitions. The included reset command restores the contributed defaults. Records are
loaded from the backend's `POST /api/query` command into a shared, validated,
columnar query-result model. Response-local branded row and column indexes
provide direct value access without converting flexible results into fixed
domain objects. Persisted configurations continue to use attribute names and
resolve them to column handles once per response.

Record-oriented screens use a shared master-detail editor over the same
columnar query result. A ticket row click selects it for contextual actions;
double-click, Enter, or the visible Edit command opens its pane on the right.
User rows currently open directly because they have no contextual actions.

`createMasterDetailStore` in `src/plugins/core/master-detail/master-detail-store.ts`
owns the generic entity view's queries, debounced inputs, sorting, facets,
selection decisions, action targets, and live updates. It exposes read-only
Solid accessors and named operations. Construct it once under a Solid owner with
explicit services and reactive view inputs; dispose that owner when leaving the
view. A different entity type gets a new store. Use its coherent `table()` snapshot
for rows and response-local bindings. Row, count, and facet requests settle
independently; their loading and error states are exposed separately.

`EntityMasterDetailView` renders those accessors and forwards user events. DOM
measurements and paint scheduling stay in the component. The record editor stores
coordinate field conversion, persistence, and external changes while the existing
Form runtime remains the sole owner of drafts, validation, and autosave. Both
standalone editors and the master-detail view use these stores. Store tests run
under Node with Solid client reactivity and no mounted components; DOM tests cover
focus, control wiring, and virtualization.

Server `TableDescription`s are the canonical source of entity types, references,
labels, templates, icon names, table defaults, forms, defaults, facets and validation.
Their presentation metadata is returned by `model-info`. Client domain modules
export branded entity-ID constants only, such as `ticketEntityId`.

`ModelService` shares a single metadata request across startup, history, model
exploration and entity lookups. `ModelProvider` gates the authenticated shell until
loading and compilation succeed, and offers retry on failure. Runtime descriptions
are compiled once from metadata into label parts, icon components and typed
`ValidationFunction<T>` adapters. Icons use an explicit map of direct Lucide imports
with a generic fallback; no whole-library dynamic icon import is needed.

Required and Unicode regex rules are interpreted by both the UI and server. Use the
common Rust/JavaScript regex syntax (no lookaround, backreferences, or engine-specific
flags). Defaults are declarative literals or a KSUID strategy, never executable code
from the server. Physical types/references remain authoritative. Reference lookups
are built generically from the target entity and its label template.

Binding descriptions to results resolves response-local column handles and rejects
missing or mismatched attributes. Saved view configuration still overrides default
column order, density and widths. Files ending in `.fixture.ts` contain test data
only and are not application model definitions or shipped in the UI bundle.

The shared `Form` context owns local field values and debounces changed values
into atomic `/api/mutate` updates. A shared mutation service serializes writes
per record and publishes committed field changes to explicit subscribers.
Tables and open forms reconcile those changes in place while preserving
unrelated dirty form fields. Pending changes flush immediately when an
editor unmounts. Saving does not refetch the owning query, so the table remains
stable and focused editing is not disrupted; successful mutations write
changed values into the existing reactive query rows so visible table cells
update in place. Record URLs use
`#/views/<view-id>/records/<record-id>` or
`#/administration/<entry-id>/records/<record-id>`.

Entity creation reuses the same generated controls and validation adapters in
an explicit submit lifecycle. It never debounces or submits on unmount.
Creation metadata supplies hidden immutable values such as KSUIDs and the
initial ticket status, while visible values are inserted atomically through
the generic mutate command. Create routes use `#/views/<view-id>/new` and
`#/administration/<entry-id>/new`; after insertion the owning query is
refetched and the route is replaced with the new record URL. Ticket keys are
currently entered explicitly. Automatic `<PROJECT>-<INTEGER>` allocation must
be implemented transactionally by the backend rather than inferred from a
client query.

The ticket domain contributes Projects to the Administration section. Users and
projects are created and edited through the shared `EntityMasterDetailView`,
which only requires an entity ID and resolves its runtime services from context.
Projects provide names and prefixes through the project lookup. Ticket forms require a
project, and ticket tables display its lookup label instead of the stored
project KSUID. Prefix uniqueness and automatic ticket-key allocation are not
yet enforced by the generic mutation command; key allocation belongs in a
transactional domain command when it is introduced.

Administration also includes a Model explorer backed by the server's generated
`model-info` command. It lists discoverable models and shows each attribute's
type, key and optional state, description, and foreign-model reference.

The initial editor intentionally supports only string and integer fields. It
does not yet provide optimistic updates, conflict detection, custom controls,
or a normalized entity cache.

Tabular views use TanStack Table as a headless row and cell model over these
query results. Joi retains native table markup and its own styling. Interactive
tables use one tab stop; Up/Down moves row selection, Home/End jumps to a
boundary, Space selects, and Enter activates the focused row. Sorting,
pagination, column resizing, multi-row selection, and virtualization are
intentionally deferred until their interaction requirements are clear. All backend HTTP
communication runs through the injectable `FetchService`. Permissions,
sharing, and workspace synchronization are not yet implemented.

UI capabilities can be added through the typed plugin registry during startup.
Plugin modules use the `*.plugin.ts` or `*.plugin.tsx` suffix and default-export
a plugin. Generic plugin and service registration infrastructure lives in
`src/base`. Reusable application capabilities are grouped by plugin under
`src/plugins/core`, while the ticket domain is isolated in `src/plugins/ticket`.
Registrations, components, API clients, and tests stay in their owning plugin
directory. The application bootstrap discovers plugin modules below
`src/plugins` with Vite's eager
`import.meta.glob` support, then orders them by name; no central plugin import
list is maintained. Registry construction first invokes every plugin's
`registerExtensionPoints` callback, then invokes every `registerExtensions`
callback, so extensions do not depend on plugin discovery order.

The authenticated shell is domain-neutral. Core extension points compose its
ordered providers, URL-backed view resolvers, top-bar
items, and overlays. Entity definitions come from server plugins; UI plugins
contribute navigation and saved-view defaults using their branded IDs, without
editing `App.tsx`, `Root.tsx`, or core modules. For example:

```tsx
context.registerExtension({
  point: navigationSection,
  id: "inventory-navigation",
  description: "Adds inventory navigation",
  value: {
    id: navigationSectionId("inventory"),
    label: "Inventory",
    order: 100,
    roots: () => [{
      id: navigationEntryId("inventory-products"),
      type: "leaf",
      label: "Products",
      selection: { type: "view", id: "inventory-products" },
    }],
  },
});
```

System navigation contributions add complete root subtrees. They may nest
folders, but cannot inject children into roots owned by another contribution.
Folders are structural; only leaves can navigate, appear in Recently used, or
be copied to My workspace. Contributions may provide an editable view copy;
otherwise the navigation system creates a shortcut automatically.

This is build-time discovery, not post-deployment installation: Vite expands
the eager glob into the production bundle. Runtime-loaded third-party code
would require a separate versioning, integrity, dependency, and trust model.

Plugins contribute user-triggered UI actions through the `ui.actions`
extension point. An action declares a branded ID, label, description, optional
single-character hotkey, compatible entity types, availability predicate, and
execution function. The action receives the authenticated user and a narrow
active-target capability; it does not access backend transport or table
internals. Hotkeys are case-insensitive and are ignored while focus is in an
input, textarea, select, or editable element, while modifiers are held, or
while another action is pending. The initial ticket action, **Assign to me**,
uses `i` and updates the selected row without opening the editor or refetching.
The complementary **Unassign** action uses `u` and is available when the
selected ticket has an assignee.

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

The frontend **Extension Inspector** debug contribution visualizes rendered
plugin composition. Enabling it draws orange frames with registration IDs
around visual extensions and green frames around their extension-point host
areas. The frames live in a pointer-transparent portal, so they do not change
layout or intercept interaction; press Escape to disable them. Data-only
extensions such as actions, entity descriptions, and view resolvers remain in
the metadata views because they have no meaningful DOM boundary.

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
./t pnpm install
./t pnpm --filter joi-ui dev
```

Run these commands from the repository root. The root pnpm workspace installs
dependencies for both UI projects from one lockfile.

During development, Vite proxies `/api` requests to the combined `joix` backend
at `http://127.0.0.1:3000`. Start that service separately with `./n joix`.

## How do I check and build it?

```sh
./t pnpm --filter joi-ui check
./t pnpm --filter joi-ui test
./t pnpm --filter joi-ui build
```

From the repository root, `nao ui` starts the same development server at
`http://localhost:5173`.
## How do UI components work?

### How are logical trees rendered?

`Tree` keeps hierarchy separate from presentation. A `TreeModel` stores nodes
in a `ReadonlyMap<TreeNodeId, TreeNode>` and represents roots and folder
children as ID lists. A `TreeDefinition` registers one renderer for each node
kind and delegates selection, activation, and context-menu behavior back to the
owning feature.

The normalized model makes node lookup direct, keeps focus and expansion tied
to stable IDs, and lets callers move nodes by changing small ID lists instead
of rebuilding nested objects. It also allows validation to report missing
references, duplicate placement, cycles, and unreachable nodes before
rendering. The saved-view navigation adapts its existing normalized workspace
directly into this shape.

Register the built-in folder renderer and application kinds separately:

```tsx
const reportKind = treeNodeKind("report");
const model = defineTreeModel({
  roots: ["reports"],
  nodes: [
    defineTreeFolder({ id: "reports", children: ["weekly"] }),
    defineTreeNode({
      id: "weekly",
      kind: reportKind,
      data: { label: "Weekly report" },
    }),
  ],
});
const renderers = createTreeRendererRegistry((node) => String(node.data.label))
  .register(reportKind, (node) => <span>{String(node.data.label)}</span>)
  .build();

<Tree
  ariaLabel="Reports"
  model={model}
  definition={{ renderers, onActivate: openReport }}
  defaultExpanded={new Set([reportsFolderId])}
/>
```

Use `expanded` with `onExpandedChange` when expansion must be persisted, or
`defaultExpanded` for local component-owned state. The component owns folder
disclosure, visible-row derivation, ARIA semantics, and Arrow/Home/End/Enter/
Space keyboard interaction. Renderers should provide row content only.

### How are context menus opened?

Mount one `ContextMenuProvider` around the application surface and call the
controller from a mouse event handler. Entries are created at opening time, so
they can reflect the current selection and action availability:

```tsx
const contextMenu = useContextMenu();

contextMenu.open({
  event,
  createGroups: () => [{
    id: contextMenuGroupId("record-actions"),
    entries: actionsToContextMenuEntries(actions.availableActions(), {
      disabled: Boolean(actions.pendingAction()),
      execute: actions.execute,
    }),
  }],
});
```

The provider portals the menu to the document body, keeps it inside the
viewport, and owns dismissal and keyboard navigation. Keep entry factories
synchronous and inexpensive; load remote state before opening the menu.

### How are actions launched from the keyboard?

Press `Ctrl+Shift+A` to open the action launcher. It lists the currently
available contributions from the UI action extension point. Typing filters by
label and description; Arrow Up and Arrow Down change the active result, Enter
runs it, and Escape closes the launcher. Action execution still flows through
`ActionProvider`, so contextual availability, pending state, and error handling
remain shared with action buttons, hotkeys, and context menus.

## How can table columns be customized?

Entity attributes marked `generated: true` are owned by the server: they remain
available for display but cannot define create or edit controls. Ticket keys and
creation dates use this mechanism. Creation submits the project and ordinary
fields; the server assigns the key and timestamp. The Created column is available
in the ticket column chooser.

`DataTable` accepts default `columns` and an optional `availableColumns` catalog.
Supplying a catalog enables its Columns chooser: add hidden columns at the front,
remove columns, drag to reorder, or use the up/down controls. Header dragging and
Alt+Left/Right also reorder columns. At least one column remains visible.
Reset columns restores default visibility, order, and widths only.

`columnConfig` / `onColumnConfigChange` exchange a `DataTableColumnConfig` with
stable attribute IDs in `order` and optional `visible`, and pixel sizes in
`widths`. Old configs without `visible` retain default visibility. Saved widths
survive hiding and re-adding columns. Unknown IDs and invalid sizes are ignored.
`columnConfigKey` identifies the owning view when reusing a mounted table.

Generic master-detail views persist this state in `MasterDetailViewConfig.columns`
through their existing per-view config store. Entity attributes with `table`
metadata are eligible, including those not visible by default; internal attributes
without table metadata are not offered. Hiding columns never clears filters,
facets, or sorting, and layout edits do not fetch data again.

The optional header-context-menu callback receives column-management groups as its
third argument; append these to application-specific groups. Without a callback,
the table uses the surrounding `ContextMenuProvider`, or opens the chooser directly
when used standalone. The Data Table playground's Column management scenario
demonstrates a serialized config round-trip without an application store.

## How are entity labels defined?

Set `label_template` in the server's `ModelPresentation` to describe a record's plain-text label:

```rust
label_template: "${key}: ${title}".into(), // Tickets
label_template: "${name} (${username})".into(), // Users
label_template: "${name}".into(), // Projects
```

When `model-info` loads, the generic decoder uses `defineEntity` to parse each
template once into `labelParts`, an ordered list of
literal text and attribute references. Rendering uses these parts without parsing
the template again. Application code reads the compiled `EntityDescription` from
the model service or `useEntityRegistry()`; it must not define a duplicate client model.

Templates substitute attribute values only; they do not evaluate JavaScript or
render HTML. Attribute references are validated when the entity is defined.
Missing values become empty strings. Empty labels, or definitions without a
template, fall back to the record identity and then the entity kind.

Detail headings and entity lookup loaders share `entityRowLabel(description,
result, row)`. Use `entityLabel(description, readAttribute)` for other record
representations. Lookup consumers (references, selectors, facets, and history)
inherit the label from their lookup provider. Creation headings remain `New User`,
`New Ticket`, etc., since generated attributes may not exist until creation.

## How are standalone entity pages displayed?

Use the dedicated hash route with an entity parameter, for example
`/#/entity?entity=ticket:TEST-123` or `/#/entity?entity=wikipage:<ksuid>`. Server presentation
metadata defines each public route type and its lookup attribute. Canonical
model IDs also work with the immutable primary key, e.g. `#/entity?entity=tickets:<ksuid>`.
Opening the page replaces the visible view route; closing it restores the originating view.
Previously shared top-level `?entity=` links are normalized to the hash route on load.
The detail toolbar's **Open entity page** button creates these links.

Wiki pages use a dedicated read-only display by default. **Edit** sets the
hash's `edit` parameter; **View page** removes it. A direct link containing
`#/entity?entity=wikipage:<ksuid>&edit` opens the editor. The wiki edit form omits visible attribute labels
while retaining accessible names for its inputs.

The `entity-pages` plugin registers the `entityDisplays` extension point. A
domain plugin can register one display per canonical branded entity type:

```tsx
context.registerExtension({
  point: entityDisplays,
  id: "ticket-page",
  description: "Standalone ticket display",
  value: { entityType: ticketEntityId, component: TicketPage },
});
```

Display components receive `entity`, `result`, `recordId`, and `onClose`.
Loading, missing records, ambiguous keys, and errors are handled before rendering
the display. Without a contribution, the page uses the shared `RecordEditor`
in `plugins/core/entity-editor`, also used by master-detail views. It retains
validation, autosaving and history. Committed mutations update loaded data
through the existing data-change service without refetching the form.

## How is entity history displayed?

For history-enabled entities, the record detail pane offers Details and History
tabs. Capability comes from server model metadata, not hardcoded domain names.
The `entity-history` plugin provides a mockable service; its store loads pages
only when History is opened and refreshes after committed record changes.
The edit form remains mounted across tab switches, preserving drafts and autosave.

History lists before/after values with the actor and timestamp. Missing values,
JSON null, and empty strings remain distinct. Lookups resolve users/references
when available; missing targets fall back to IDs. Historical HTML is escaped,
and long values can be expanded. `Entity History` in the playground demonstrates
creation, updates, deletion, system attribution, and these value-display cases.

History starts when enabled and retains deleted records' changes. The normal
detail pane still closes when its live record disappears; there is no deleted
record browser or revert command.
