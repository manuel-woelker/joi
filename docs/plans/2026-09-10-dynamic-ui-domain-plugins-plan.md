# Dynamic UI Domain Plugins Plan

## What does fully dynamic mean?

Make the UI shell and reusable core plugins independent of tickets and any
future application domain. Domain modules remain discovered at build time with
Vite's eager `import.meta.glob`, but adding a domain plugin must not require an
import, conditional, route case, provider wrapper, or component reference in
`App.tsx`, `Root.tsx`, `base`, or another domain plugin.

This plan does not support installing arbitrary JavaScript after deployment.
Vite resolves glob imports while building. Runtime plugin installation would
need a versioned external-module manifest, dependency negotiation, integrity
checks, and an explicit trust/security model.

The target dependency direction is:

```text
App shell -> base + core extension points
core plugins -> base + other declared core services/extension points
domain plugins -> base + core contracts
base/core -X-> domain plugins
domain plugin A -X-> domain plugin B
```

Enforce this direction with an automated import-boundary test or lint rule;
directory organization alone is too easy to erode.

## Which extension points should compose the shell?

Prefer small shell contribution contracts over one large `DomainPlugin`
object. A domain should be an ordinary `UiPlugin` that contributes only the
capabilities it needs.

Add core-owned extension points for:

- **application providers**: ordered Solid parent components that install
  domain state/context around the authenticated shell;
- **navigation sections**: ordered sidebar components with stable IDs and
  labels, allowing administration, saved ticket views, and future domains to
  coexist without one navigation component importing another;
- **view resolvers**: ordered resolvers from the current URL-backed navigation
  selection to an `ApplicationView`;
- **shell overlays**: editors, dialogs, and other components rendered beside
  the main view, such as the saved-view editor;
- **top-bar contributions**: ordered commands or indicators needed by a
  domain, such as workspace undo and reset;
- **entity descriptions**: canonical descriptions indexed by branded entity
  ID, so generic query, table, lookup, and editor code can resolve entities
  without importing `ticketEntity` or `userEntity`.

Every contribution should have a stable branded ID and an explicit order.
Extension-point validators should reject duplicate IDs, ambiguous view
resolution, missing entity references, and invalid order values during
application construction rather than after rendering.

Provider ordering must not become a second dependency graph. Providers that
need services should declare those services through the existing typed plugin
service mechanism. The provider extension point only controls Solid context
nesting after plugin initialization.

## How should navigation and view resolution work?

Move URL/hash observation entirely into a base navigation service. It should
store a domain-neutral selection containing a route kind and decoded path
segments, expose navigation methods, and react to `hashchange`. It must not
validate ticket workspace IDs or know `views`, `tickets`, or administration
records.

Core and domain view resolvers interpret the selection they own:

```ts
interface ViewResolverContribution {
  readonly id: ViewResolverId;
  readonly order: number;
  resolve(selection: NavigationSelection): ApplicationView | undefined;
}
```

The shell evaluates resolvers in order and requires at most one match. Unknown
routes render a generic not-found/empty view instead of silently selecting a
ticket view. Route construction should use shared helpers rather than string
concatenation spread across plugins.

Split the existing `NavigationTree`: the core shell owns the sidebar frame,
search/layout behavior, and rendering of navigation-section contributions;
the administration plugin contributes its section; the ticket plugin
contributes saved ticket folders/views. Neither section imports the other.

## How should entities and saved views become domain-neutral?

Create an entity-description extension point and an immutable
`EntityRegistryService`. Register user and ticket descriptions from their
owning plugins. Generic consumers resolve a branded `EntityId`; they do not
import concrete descriptions or access attributes through unchecked names.

Promote reusable saved-view infrastructure from `plugins/ticket/workspace` to
a focused core `saved-views` plugin. Generalize its model:

- replace `source: "tickets"` with a branded `entityId`;
- use entity attribute handles resolved through `EntityRegistryService`;
- remove `TicketStatus` and ticket-specific status controls from the core
  model/editor;
- validate query filters, sorting, and presentation fields against the
  referenced entity description;
- query records through one generic entity query service;
- render table/master-detail content from the resolved entity description.

The initial generic filter editor may support the existing operators with
value-type-aware text, integer, and lookup controls. Ticket-only conveniences,
such as a specialized status picker, should be a later editor contribution,
not a condition in core saved-view code.

Domain plugins contribute default saved-view definitions through a separate
extension point. Build one validated initial workspace after all plugins are
registered. IDs must be globally stable and include a domain namespace.
Persisted workspaces need an explicit schema migration from the current
ticket-only version. Preserve user changes; merge newly introduced plugin
defaults only when their stable IDs have never been accepted or deliberately
removed. If deletion semantics are not yet tracked, do not silently resurrect
deleted views: versioned reset defaults are safer than an incorrect merge.

## What should remain in the ticket plugin?

After extraction, `ui/src/plugins/ticket` should contain only ticket-owned
behavior:

```text
plugins/ticket/
  ticket.plugin.tsx
  entities/ticket-entity.ts
  actions/ticket-actions.plugin.ts
  saved-views/ticket-default-views.ts
  saved-views/ticket-editor-contributions.tsx   # only if still needed
  tests/
```

The ticket plugin should register its entity, default views/presentations,
navigation contribution if not supplied generically by core saved views,
ticket actions, and optional ticket-specific editor controls. Delete
ticket-specific wrappers such as `loadTickets` once the generic entity query
service covers them.

User administration remains a core plugin for now because authentication and
sessions are part of the reusable server contract. It registers `userEntity`
through the same entity extension point and resolves navigation through base
services, never through ticket state.

## Implementation Checklist

- [ ] Add branded IDs and typed contribution contracts for application
      providers, navigation sections, view resolvers, shell overlays, top-bar
      entries, entity descriptions, and default saved views.
- [ ] Add focused core plugins that register these extension points and
      validate contribution IDs, ordering, entity references, and resolver
      ambiguity.
- [ ] Move hash observation and route construction into the base navigation
      service; add tests for decoding, unknown routes, record/create routes,
      history replacement, and cleanup.
- [ ] Refactor the authenticated app shell to compose providers and render
      navigation, current view, top-bar entries, and overlays exclusively from
      core extension points. Remove every ticket import from `App.tsx` and
      `Root.tsx`.
- [ ] Split the current navigation tree into a generic sidebar frame plus
      independent administration and saved-view navigation contributions.
- [ ] Add `EntityRegistryService`; move entity discovery to extensions and
      update generic tables, editors, mutations, lookups, and administration
      to resolve entities through it.
- [ ] Promote workspace/saved-view infrastructure to
      `plugins/core/saved-views`; replace ticket source and status types with
      entity IDs, typed attributes, and generic filter values.
- [ ] Replace `loadTickets` and ticket-specific saved-view rendering with a
      generic entity query/view component driven by entity descriptions.
- [ ] Convert current ticket behavior into ordinary contributions from
      `plugins/ticket`, including its entity, actions, initial views,
      presentation defaults, and any ticket-specific editor controls.
- [ ] Convert administration and user behavior to the same navigation, view,
      and entity contribution mechanisms so it exercises the public contracts
      rather than a privileged shell path.
- [ ] Add a persisted-workspace migration with fixture tests for current v2
      data, malformed data, unknown domain entities, and preserving user-owned
      definitions.
- [ ] Add an import-boundary check that rejects base/core imports from
      `plugins/ticket` or any future domain directory and rejects cross-domain
      imports.
- [ ] Update UI architecture documentation with contribution examples and the
      distinction between build-time discovery and runtime installation.

## Verification

- [ ] Add a minimal test-only second domain plugin with a distinct entity,
      navigation section, default view, and editor. Verify it appears and works
      without modifying the app shell or core code.
- [ ] Disable the ticket plugin in a test build and verify login,
      administration, debug tools, status bar, playground, and unknown-route
      handling still render without ticket assumptions.
- [ ] Verify ticket and user list/detail/create/edit flows, action hotkeys,
      context menus, lookups, URL restoration, saved-view editing, reset, undo,
      and local-storage migration.
- [ ] Verify duplicate entity/contribution IDs, unresolved entity references,
      and ambiguous view resolvers fail during registry construction with
      actionable source locations.
- [ ] Run UI unit tests, TypeScript type checking, and a production Vite build.
- [ ] Run `./t nao check`.
- [ ] Restart active development tasks with `./t nao --restart`.

## Risks and Assumptions

- A single opaque domain contribution would be quicker but would recreate a
  monolithic interface and make cross-domain composition difficult. Focused
  extension points cost more wiring but match the existing plugin model.
- Solid context providers are order-sensitive. Stable ordering and duplicate
  validation are mandatory; service dependencies remain the source of truth
  for initialization order.
- Generalizing persisted ticket views is the highest-risk part. Treat storage
  migration and default reconciliation as product behavior, not incidental
  refactoring.
- An entity description currently mixes persistence, table, and form concerns.
  Keep it intact for this change unless the second test domain proves a real
  need to split those facets; doing both redesigns together would be
  overengineered.
- Eager discovery includes all domain code in the initial bundle. Lazy domain
  loading can be added later by changing discovery and contribution values to
  async factories, after measuring bundle or startup costs.

## Decisions

- Continue using eager Vite glob discovery for deterministic synchronous
  registry construction.
- Support multiple domain plugins in one application; do not select one global
  active domain.
- Keep the shell layout core-owned and expose explicit slots rather than let a
  domain replace the entire application root.
- Keep authentication and user administration in core until the backend makes
  identity optional or replaceable.
- Use a small test domain as the acceptance test that the architecture is
  genuinely dynamic rather than merely ticket code hidden behind interfaces.
