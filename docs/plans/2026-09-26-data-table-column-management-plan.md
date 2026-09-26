# Data Table Column Management

## What is the goal?

Allow users to add, remove, and rearrange displayed table columns. Newly added
columns appear at the front. Persist visibility, order, and widths in the owning
view's configuration, including generic master-detail views for tickets, users,
and projects. Keep DataTable independent of persistence and entity metadata.

## What already exists?

- `ui/src/components/DataTable.tsx` supports resizing, pointer-based reordering,
  keyboard moves, and `DataTableColumnConfig` containing `order` and `widths`.
- `master-detail-store.ts` owns column config and includes it in the debounced
  `MasterDetailViewConfig` snapshot. It restores state on view changes and flushes
  pending saves on disposal. Reuse this lifecycle.
- `EntityMasterDetailView.tsx` supplies default columns through
  `createEntityTableColumns`, and supplies a column-header context menu for
  clearing filters/facets.
- Entity descriptions distinguish default-visible attributes from other
  attributes. Bound entities retain all query columns, including the identity
  needed for selection and editing.
- Saved views also have presentation definitions. Do not change shared
  presentations when a user customizes one view's table.

## What should the interaction be?

Add a compact Columns icon button opening an anchored, dismissible column chooser.
Use the existing Select for searching available columns and existing overlay
patterns so the chooser is not clipped by the table's scroll container.

- List visible columns in their current order, with drag handles and trash icons.
- Provide an Add column select containing only eligible hidden columns, showing
  their model labels, types, and descriptions where available.
- Selecting a column inserts it at index zero, including when re-adding a column
  that was previously removed. Retain its saved width.
- Reuse table-header dragging for direct reordering. Provide keyboard move
  controls in the chooser so reordering does not require a pointer.
- Merge Remove column and Columns menu actions with existing header menu entries;
  do not replace the filter/facet commands.
- Keep at least one visible column; disable its removal with an explanation.
- Provide Reset columns to restore the view's initial columns/order/widths without
  resetting filters, sorting, facets, or other view settings.

Use `ModelText` for column labels. Buttons have accessible labels and tooltips;
use existing icons, selection controls, context menus, and drag conventions.

## What is the state contract?

Extend `DataTableColumnConfig` with optional `visible: readonly string[]`, using
stable attribute IDs, never response-local handles or column positions.

- `order` remains the ordered column IDs; `visible` is membership only. The
  ordered visible list is derived, not persisted a second time.
- Missing `visible` means the original/default columns. Existing saved
  `{ order, widths }` configurations must retain their current behavior.
- Extend DataTable with an optional `availableColumns` catalog. Existing `columns`
  remains the default selection; existing callers without a catalog behave as
  before. The catalog supplies full definitions, including custom cell renderers.
- Enable the chooser explicitly for callers that provide a catalog; persistence
  continues through `columnConfig` and `onColumnConfigChange`.
- Normalize unknown/duplicate IDs and invalid widths against the current catalog.
  An empty or entirely stale selection falls back to defaults, then the first
  eligible column if necessary. An empty catalog renders a graceful empty state.
- Adding prepends the ID to `order` and includes it in `visible`. Removing changes
  visibility only. Reordering affects visible columns, without accidentally using
  hidden columns as pointer targets.
- Keep normalization and add/remove/move/reset operations in a small pure module
  shared by the table controls, with focused tests. Do not build another registry
  or generic configuration framework.

## How does this integrate with views?

Build the eligible catalog from entity attributes with table metadata, including
attributes marked `visibleByDefault: false`. Attributes without table metadata
remain unavailable, so internal IDs are not exposed unintentionally. Preserve
lookup rendering, rich-text rendering, type-based formatting, and default widths.

Pass the catalog and defaults to DataTable and keep the existing store/config
callback path. Persist under `MasterDetailViewConfig.columns`, scoped to the
current view identity. Copies inherit config as a deep copy, then evolve
independently. System and workspace views must not leak changes into each other.

For any active saved-presentation rendering path, derive defaults from its
presentation and store per-view overrides through the same view-config mechanism,
without mutating the reusable presentation. Confirm which route uses that path
before changing it; do not refactor unrelated legacy view infrastructure.

Column changes are presentation changes: do not refetch rows/counts/facets when
the current query already supplies all attributes. Keep hidden identity columns
available for selection/editing and rebind display definitions when query results
change. Hiding a column does not clear its sorting, filters, or facets; clearing
those remains an explicit action.

## What are the implementation steps?

- [x] Add documented visibility/catalog contracts and pure configuration
      normalization/transition functions, preserving old config compatibility.
- [x] Integrate visibility with TanStack column state and update drag geometry,
      keyboard moves, header/body rendering, quick-filter alignment, and last
      visible column width filling. Persist only committed drag changes.
- [x] Add the reusable chooser and header menu integration, including add-first,
      remove, accessible reorder, reset, and last-column protection.
- [x] Build eligible entity catalogs and wire master-detail views through the
      existing config store. Cover active presentation-based views as described.
- [x] Extend DataTable playground scenarios with many available columns, hidden
      defaults, customized widths/order, and a controlled config round-trip.
- [x] Document the public DataTable API and view persistence behavior in UI docs.
- [x] Add regression tests and complete verification below.

## How will this be verified?

- Pure tests: add-first/re-add-first, remove, reorder with hidden columns, reset,
  width preservation, invalid/duplicate IDs, catalog changes, and old configs.
- Component tests: chooser filtering, no duplicate choices, last-column guard,
  keyboard operation, header context-menu composition, resize versus reorder,
  and aligned visible headers/cells/quick filters after result replacement.
- Store/integration tests: reload and navigation restore config; pending changes
  save to the originating view; copies are independent; unrelated view config
  survives; column edits cause no backend query and preserve row selection.
- Playground manual verification: add appears first, drag preview follows visible
  columns, last column fills space, narrow layouts and virtual scrolling work.
  Leave browser verification to the user unless requested otherwise.
- Run focused tests through `./t`, then `./n check` and `./n --restart`.

## What assumptions and risks need attention?

- Assumption: retain at least one column and keep query constraints unchanged
  when hiding columns. These avoid an unusable table and surprising query changes.
- Assumption: table metadata defines eligibility, rather than exposing every
  stored attribute. Plugins can opt additional attributes in explicitly.
- Catalog definitions contain result-local handles: never serialize them or reuse
  handles across result replacements. Layout config contains stable IDs only.
- Existing header dragging uses all leaf columns in places. Visibility requires
  auditing those paths, especially the last column's leftover-width calculation.
- Controlled config updates must not create save loops, interrupt a resize, or
  reapply stale config during live drag previews.

## What implementation details were resolved?

- The chooser lives in `TableColumnChooser.tsx`; configuration transitions are
  pure functions in `table-column-config.ts`. TanStack owns live table layout.
- The existing master-detail store already persists the expanded column config;
  no second store or persistence layer was needed.
- `SavedViewContent` and `SavedViewCommands` have no active callers in the current
  source tree. That legacy presentation path remains untouched.
- Standalone DataTables can open the chooser without a context-menu provider.
  With a provider they also offer header menu actions. Custom header callbacks
  receive the column-management groups to compose with their own actions.
- The catalog supplements default columns, preserving explicit default renderer
  overrides. Only explicitly table-configured entity attributes are offered.
- Browser verification is left to the user, as requested. This repository does
  not use a completed-plans folder; completed plans remain in this directory.

## What verification completed?

- Focused configuration, table, entity-catalog, view-store, and copied-view tests
  passed. Regression coverage includes native chooser dragging, pointer header
  dragging with hidden columns, committed-only drag callbacks, width restoration,
  query-result replacement, empty catalogs, add-first/re-add-first, and reset.
- Store tests confirm visibility round-trips, pending-save identity, copied-view
  independence, unchanged selection, and no backend requests for layout edits.
- `./n check` passed all 12 tasks, including UI tests and type checking.
- `git diff --check` passed. Development restart requested with `./n --restart`.
