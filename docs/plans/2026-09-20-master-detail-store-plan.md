# Master-Detail Store Refactor

## What is the goal?

Make the generic entity master-detail UI a rendering layer over an instance-local
Solid store. Queries, state transitions, navigation decisions, and mutation
coordination should be testable without mounting the application or a table.
Preserve the existing behavior for tickets, users, projects, and other registered
entities.

## What exists today?

`ui/src/plugins/core/master-detail/EntityMasterDetailView.tsx` owns query resources,
filter/search debounce, sorting, facets, URL selection, action targets, live row
updates, loading timers, and performance measurements alongside its JSX.
`MasterDetailView.tsx` already mainly handles layout. `RecordEditor.tsx` separately
owns save/create coordination, value conversion, and data-change subscriptions.
The existing Form model already owns drafts, validation, dirty state, and saving.

## What should the store expose?

Add `master-detail-store.ts` in the same directory, exporting
`createMasterDetailStore(options, dependencies)` and its public contract.
Use existing Solid signals, memos, and resources internally; expose read-only
`Accessor<T>` values and named operations, with TSDoc describing their behavior.
No new global registry or state-management dependency is required.

- Inputs: resolved entity description and reactive accessors for initial filter,
  initial sorting, and view identity. Keep entity identity fixed per store instance;
  switching entity types recreates and disposes the store.
- Dependencies: explicit existing fetch, data-change, mutation, lookup, navigation,
  and action services, narrowed to the members actually used. Resolve context hooks
  in the component's composition boundary; the store must work without providers.
- State: editable filter/search/column-search values, committed query parameters,
  sorting, visible facets and selections, active panel, independent row/count/facet
  loading and errors, delayed loading visibility, bound table data, editor state,
  selected ID, create mode, and the current action target.
- Operations: change filter/search/column search/sort, toggle or close panels,
  add/remove/change facets, refresh, select a row, start creation, close details,
  save changes, and complete creation. Context-menu entries are prepared lazily
  through store operations after selecting the target row.

Use one `activePanel` signal (`filter`, `facets`, or undefined) to represent mutual
exclusion. Keep URL navigation authoritative for record selection and create mode.
Expose a coherent table snapshot so rows, identity handles, bound columns, and
result always belong to the same query response.

## Where does rendering stop and logic start?

The component resolves dependencies, creates the store once, renders accessors,
and forwards events. Keep JSX, custom cell/lookup renderers, DOM refs,
ResizeObserver, focus, and context-menu positioning in the rendering layer.
Forward viewport measurements and paint timings to the store through explicit
operations; store tests should not require DOM measurement or animation frames.

Move editor coordination into a small store module composed by the master-detail
store if needed to keep it readable. Reuse the existing Form model as the sole
owner of field drafts, validation, touched state, and persistence lifecycle.
The rendering adapter may bind that model to Form context, but it must not own
business effects or subscriptions. Preserve standalone RecordEditor callers by
having their adapter construct the same editor store with explicit dependencies.

## Which behavior must be preserved?

- Filters, quicksearch, and column search debounce for 300ms; sorting and facet
  changes execute immediately. Highlights reflect committed query parameters.
- Rows, total counts, and facet aggregates load independently. Each facet excludes
  its own selections using the existing entity-query helpers.
- Initial table shell renders before data arrives; subsequent loading indication
  retains the 200ms delay and replaces only the body. Preserve independent pane
  scrolling, fixed headers, virtualization, and input focus.
- Identity changes reset transient query state coherently and cancel obsolete
  debounce work. Late responses must not replace a newer view or close its details.
- Live mutations update existing query rows and editor state without refetching or
  remounting the form. Preserve Form reconciliation semantics for unsaved fields.
- Explicit creation refreshes results/counts/facets and selects the created record
  only when it belongs to the refreshed results. Missing selections are cleared
  using the current settled row result, not an old result during loading.
- Action target registration, lookup invalidation, timers, requests, and data-change
  subscriptions follow the store owner's lifetime. Async completion after disposal
  must not navigate or mutate a replacement view.

## Implementation Checklist

- [ ] Inventory current call sites and tests; record query counts, loading rules,
      selection behavior, and editor persistence behavior as characterization cases.
- [ ] Define the store contract and explicit dependencies. Create it under the
      caller's Solid owner with `onCleanup`; use `createRoot` plus disposal in tests.
- [ ] Move query state, debounce/reset effects, resources, facets, bindings,
      highlights, refresh, and delayed loading into the store. Reuse existing query
      helpers and preserve response-local branded handles.
- [ ] Move navigation decisions, action target construction/registration, and
      data-change reconciliation into store operations and effects.
- [ ] Extract editor coordination and pure form/value conversion helpers; retain
      the Form model's existing lifecycle and remove duplicate row reconciliation.
- [ ] Wire EntityMasterDetailView, MasterDetailView, and RecordEditor to accessors
      and operations. Remove moved effects/helpers and direct service calls from
      rendering code; retain only DOM-specific adapters.
- [ ] Add store behavior tests and retain focused component tests for event wiring,
      focus preservation, virtualization, and layout. Document the store API and
      dependency/lifetime contract in `ui/README.md`.

## How will this be verified?

Use controlled async service responses and fake timers in store tests. Cover
debounce vs. immediate sorting, independent query completion, facet self-exclusion,
refresh request counts, view resets, stale/out-of-order responses, errors and retry,
200ms loading visibility, selection and URL operations, creation under filters,
external updates, save failures, and disposal with pending work. Test transitions
and observable service calls rather than internal signal implementation.

Run store tests without rendering components; ensure Vitest resolves Solid's client
reactivity implementation even in the Node test environment (SSR effects do not
execute). Use happy-dom only for tests that need actual DOM interactions.

- [ ] Run focused UI tests and `./n ui-typecheck`.
- [ ] Exercise tickets/users/projects: filtering, sorting, facets, selection,
      creation, editing, actions, refresh, and browser back/forward.
- [ ] Check desktop and narrow layouts, fixed headers, independent scrolling, and
      stable focus while queries and saves complete.
- [ ] Run `./n check`, then `./n --restart`.

## What assumptions and risks need attention?

This is a behavior-preserving refactor, not a new query/cache framework. Existing
query and mutation services remain responsible for transport and wire conversion.
Keep pure derivations as ordinary functions instead of creating service interfaces
for every helper.

The largest risks are losing Solid ownership during async work, duplicating Form
state, mixing handles from different QueryResults, and resetting drafts on resource
refresh. Cover these before deleting existing integration coverage. Retain current
missing-record semantics for bounded query results; distinguishing deletion from
being outside the loaded page is a separate product decision.

No blocking questions: assume all generic master-detail orchestration, including
editor coordination, is in scope. Existing field controls and the reusable Form
implementation retain their own component-level behavior.
