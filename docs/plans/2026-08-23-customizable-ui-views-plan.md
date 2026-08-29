# Customizable UI Views Plan

## What are we building?

Turn the basic `ui` SolidJS scaffold into a functional workspace where users
can create, save, organize, and open application views from a navigation tree.
A saved view composes two independently reusable definitions:

- A **query** selects, filters, and orders application records.
- A **presentation** controls how compatible records are displayed.

The first version should demonstrate the complete interaction model using a
small local ticket dataset and browser persistence. It should not introduce a
backend protocol, permissions, collaborative editing, arbitrary dashboard
widgets, or a general-purpose query language yet.

## What should the workspace look like?

Use a compact application shell with four regions:

- A top bar for product identity, the current view name, and global commands.
- A resizable left sidebar containing favorites and a hierarchical folder/view
  tree.
- A main workspace containing the selected view, its filters, and its records.
- A right-side configuration panel shown only while creating or editing a view.

Keep the footer minimal or remove it once the workspace fills the viewport; a
persistent footer consumes useful space in an operational application. The
layout must remain usable on narrow screens by showing the navigation and
configuration regions as dismissible overlays rather than compressed columns.

## How should views be modeled?

Use stable opaque IDs and normalized stores so names and tree positions can
change independently:

```ts
interface SavedView {
  id: ViewId;
  name: string;
  description?: string;
  queryId: QueryId;
  presentationId: PresentationId;
}

interface QueryDefinition {
  id: QueryId;
  name: string;
  source: "tickets";
  filters: FilterDefinition[];
  sorting: SortDefinition[];
}

interface PresentationDefinition {
  id: PresentationId;
  name: string;
  source: "tickets";
  layout: TablePresentation | ListPresentation;
}

type NavigationItem =
  | { id: NavigationId; type: "folder"; name: string; children: NavigationId[] }
  | { id: NavigationId; type: "view"; viewId: ViewId };
```

Keep query filters declarative and typed. The initial operators should cover
equality, inequality, membership, and case-insensitive text matching. Keep
presentation configuration limited to table/list layout, visible fields,
labels, widths, and density. A presentation declares the source and required
fields so incompatible query/presentation combinations can be rejected before
rendering.

Runtime state such as selection, temporary filter values, sidebar expansion,
and the open editor must remain separate from persisted definitions. Temporary
changes must not silently modify a saved or shared definition.

## How should reuse work?

Creating a view should let the user either choose an existing query and
presentation or create a new one inline. Editing a reused definition must make
the consequence explicit:

- **Update definition** changes every view that references it.
- **Save as copy** creates a new definition and updates only the current view.

Do not build separate query and presentation management screens initially.
Expose reuse through the view editor and show the number of referencing views
there. Add dedicated management screens only when the number of reusable
assets makes them necessary.

## How should navigation behave?

- Selecting a view updates the URL hash to `#/views/<view-id>` and restores the
  same view after a reload.
- Folders can be expanded, collapsed, created, renamed, reordered, and deleted
  when empty.
- Views can be created, renamed, duplicated, moved between folders, reordered,
  favorited, and deleted with an undo opportunity.
- Keyboard navigation follows tree semantics: arrow keys move and expand,
  Enter opens, and focus remains visible.
- Contextual commands are available from a compact menu; common create and
  edit commands remain directly reachable.
- Drag and drop may supplement move controls, but must not be the only way to
  structure the tree.

Use semantic tree roles and announce mutations for assistive technology. Store
folder expansion and sidebar width as local UI preferences, not as part of the
navigation model.

## How should state and persistence work?

Create a small workspace repository boundary rather than accessing
`localStorage` from components. It should load, validate, migrate, and save one
versioned workspace document containing queries, presentations, views,
navigation items, and favorites.

Seed a coherent example workspace on first use. Persist user changes locally
and provide a reset command for development. Malformed or unsupported stored
data should fall back to the seed safely and report a visible, non-destructive
error. Keep IDs and persistence APIs transport-neutral so a server-backed
repository can replace local storage later.

Use Solid primitives and context for the workspace controller. Avoid a general
state-management dependency until the local model demonstrates that one is
needed.

## Implementation Checklist

- [x] Add Vitest, Solid Testing Library, `@testing-library/user-event`, and a
      DOM test environment; define `test` and `test:watch` package scripts.
- [x] Introduce focused model modules for branded IDs, records, filters,
      queries, presentations, saved views, navigation items, runtime state, and
      the versioned persisted workspace document.
- [x] Implement pure query evaluation and stable sorting over a local ticket
      fixture, with table/list presentation compatibility validation.
- [x] Implement a workspace repository interface and a browser-local
      implementation with schema validation, versioned migration hooks, seed
      data, and safe recovery from invalid storage.
- [x] Implement a Solid workspace controller with immutable updates for query,
      presentation, view, folder, favorite, and navigation operations.
- [x] Replace the scaffold with a responsive application shell containing the
      compact top bar, resizable navigation sidebar, main workspace, and
      conditional configuration panel.
- [x] Build an accessible navigation tree with expansion, selection, keyboard
      interaction, create/rename/move/reorder/duplicate/delete commands, and
      favorites.
- [x] Add hash-based view routing and restoration without adding a router
      dependency; handle missing view IDs with a useful empty state.
- [x] Build table and list renderers plus a compact toolbar for temporary
      filtering, sorting, density, and view editing.
- [x] Build the view editor for binding existing definitions, creating new
      definitions, editing private copies, showing reuse counts, validating
      compatibility, and explicitly saving or cancelling changes.
- [x] Add confirmation or undo behavior for destructive navigation changes and
      an accessible live region for operation outcomes.
- [x] Add responsive sidebar/editor overlays, focus management, visible focus
      styles, empty/loading/error states, and reduced-motion behavior.
- [x] Update `ui/README.md` with the workspace concepts, development commands,
      persistence behavior, and current limitations.
- [x] Run type checking, unit/component tests, production build, and manual
      desktop/mobile interaction checks through the existing `nao ui` task.

## What tests should cover the first version?

- Query operators, stable sorting, and deterministic handling of missing
  fields.
- Presentation/query compatibility and required-field validation.
- Persistence round trips, unsupported versions, malformed data, and migration
  hooks.
- Tree mutations preserving IDs, ordering, parentage, favorites, and valid
  selection.
- Reusing one query or presentation across multiple views, including update
  versus copy behavior.
- Hash navigation, reload restoration, missing views, keyboard tree traversal,
  editor save/cancel, and responsive navigation toggles.

Prefer pure model tests for state transitions and a smaller number of
black-box component tests for user workflows. Browser-level automation can be
added once the backend integration or routing surface expands.

## What assumptions does the plan make?

- The initial data source is a local ticket fixture shaped around bugs, tasks,
  and issues; it is a testbed rather than the final transport contract.
- Queries and presentations are private browser-local assets in the first
  version. The model leaves room for ownership and sharing metadata later.
- A view references exactly one query and one presentation. Multi-panel
  dashboards are intentionally out of scope.
- Table and list layouts are sufficient to prove reuse. Board, detail, and form
  layouts should be added only after their data requirements are understood.
- The URL identifies the selected view, while unsaved runtime state remains
  local to the current session.

## Risks and Open Questions

- Editing reused definitions is the largest UX risk. The editor must clearly
  communicate how many views will change and default to saving a copy when the
  user's intent is ambiguous.
- Query/presentation compatibility may eventually require richer source schema
  metadata. The first version should use a small explicit ticket field schema,
  not infer field types from fixture values.
- Reordering can become complex when drag and drop, keyboard operation, and
  touch input are combined. Implement deterministic move commands first and
  layer drag and drop over the same controller operations.
- Decide during implementation whether deleted items need a timed undo toast or
  a trash collection. A timed undo is simpler for the local first version.
- Backend synchronization will require conflict and revision semantics. Do not
  bake browser timestamps or last-write-wins assumptions into the core model.

## Verification

Run:

```bash
cd ui
pnpm check
pnpm test --run
pnpm build

cd ..
nao --list
nao ui
```

Manually verify at desktop and narrow mobile widths that users can create a
folder, create and move a view, reuse a query and presentation, open the view
through its hash URL, edit it using both update and copy flows, reload persisted
state, navigate the tree by keyboard, and recover safely after resetting local
data.

All automated commands completed successfully on 2026-08-23. The suite has 12
tests across query execution, presentation validation, normalized workspace
operations, persistence recovery, and rendered user workflows. The application
was also served through `nao ui`; browser screenshot automation is not
available in the current tool environment, so responsive behavior was checked
through the implemented media-query constraints and component tests rather
than captured screenshots.
