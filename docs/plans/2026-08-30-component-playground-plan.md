# Component Playground Plan

## What are we building?

Add a development-focused component playground to the SolidJS UI. Vite should
eagerly discover every `*.demo.tsx` module with `import.meta.glob`, collect the
modules into a typed demo library, and render that library at `#playground`.
The normal application keeps its existing `#/views/...` hash navigation.

Use **scenario** instead of **instance**. A scenario describes a meaningful
component state or configuration, such as "Empty", "Loading", or "Long text";
it communicates intent better than a generic runtime instance and is familiar
terminology in UI testing.

The initial playground is an internal development tool. It should not add a
router dependency, persist state, communicate with the backend, or become part
of the plugin system.

## How should demos be defined?

Define a small typed authoring API:

```tsx
export interface ComponentScenario {
  readonly name: string;
  readonly description?: string;
  readonly render: () => JSX.Element;
}

export interface ComponentDemo {
  readonly name: string;
  readonly description: string;
  readonly scenarios: readonly ComponentScenario[];
}
```

Each `*.demo.tsx` file default-exports one `ComponentDemo`. Keep scenarios as
render functions so every scenario gets fresh Solid component state and can
configure props, local signals, or lightweight test doubles without adding a
generic prop-control abstraction.

The source-relative module path is registry metadata and provides a stable,
unique internal ID for navigation. Authors should not have to maintain a
second ID alongside the required name and description. Validate modules at
startup and report the source path for missing exports, empty names or
descriptions, missing scenarios, and duplicate scenario names within a demo.
Sort demos and scenarios by display name for deterministic navigation.

Do not add global decorators or provider injection initially. A scenario that
needs context should wrap its component explicitly. Introduce shared fixtures
only after multiple demos need the same setup.

## How should discovery work?

Create a playground library module that discovers demos with an eager glob:

```ts
const demoModules = import.meta.glob<ComponentDemoModule>("./**/*.demo.tsx", {
  eager: true,
});
```

Keep discovery in one module and pass its result to a pure collector that
validates and normalizes the library. Tests should call the collector with an
in-memory module record instead of attempting to mock Vite's compile-time
glob transformation.

Place demo files next to the components they exercise. Exclude `*.demo.tsx`
from Vitest's test matching only if current defaults begin treating them as
tests; do not add configuration preemptively.

## How should `#playground` work?

Select the root application from `window.location.hash` in `index.tsx`:

- `#playground` and hashes beginning with `#playground/` render
  `PlaygroundApp`.
- All other hashes render the existing `App`.

Make the root selection reactive to the `hashchange` event so links can move
between the workspace and playground without reloading the document. Keep the
playground namespace distinct from the workspace's `#/views/...` routes and do
not introduce pathname routing or a router dependency.

Use `#playground/<demo-source-id>/<scenario-name>` for selection, with both
segments URI encoded. This provides reloadable deep links and browser
back/forward without introducing a router. Bare `#playground` and invalid or
stale selections should fall back to the first demo and scenario while
replacing the hash with the canonical value.

Build a compact, full-height library layout:

- A top bar identifies the playground and links back to Joi.
- A left navigation lists demos and their descriptions.
- The main area shows the selected demo description.
- Every scenario appears in a clearly labelled, isolated preview region with
  its optional description and rendered component.
- A useful empty state explains that no `*.demo.tsx` modules were discovered.

Reuse global colors, fonts, and reset styles, but keep playground layout and
preview styling in CSS modules. Preview regions must use a neutral application
surface and avoid imposing layout styles on the component under test. On
narrow screens, move navigation above the previews rather than hiding it.

## Implementation Checklist

- [x] Add `ComponentDemo`, `ComponentScenario`, and demo-module types in a
      dedicated `ui/src/playground` module.
- [x] Implement a pure demo-library collector with source-path IDs,
      deterministic ordering, validation, and actionable source-aware errors.
- [x] Add collector tests for valid modules, ordering, malformed exports,
      empty scenarios, duplicate scenario names, and empty discovery results.
- [x] Discover `**/*.demo.tsx` eagerly through one `import.meta.glob` call and
      expose the resulting immutable demo library.
- [x] Implement hash parsing and navigation for demo/scenario selection,
      canonical fallback, reload restoration, and browser back/forward.
- [x] Build `PlaygroundApp` with accessible demo navigation, demo metadata,
      scenario previews, empty state, responsive behavior, and a link back to
      the main application.
- [x] Route `#playground` and its nested selection hashes to the playground in
      `index.tsx`, react to `hashchange`, and leave existing workspace routes
      under their current hash namespace.
- [x] Add representative colocated demos for `IconButton` and `DataTable`,
      including interactive, empty, and varied-data scenarios where relevant.
- [x] Add component tests for root hash selection, navigation, deep links,
      stale hashes, scenario rendering, and the empty library state.
- [x] Update `ui/README.md` with the demo contract, naming convention, and
      `#playground` URL.

## What assumptions does the plan make?

- The playground ships in the same Vite bundle as the application. A separate
  build entry or production exclusion is unnecessary until bundle size or
  deployment policy requires it.
- Demo modules are trusted development code and may execute module-level code
  during eager discovery.
- A scenario renders one component state but may include supporting controls
  needed to demonstrate interaction.
- Scenario names are unique only within their demo. Demo source paths are
  unique by construction and remain the stable navigation identity.
- The first version renders scenarios in the host document. iframe isolation,
  viewport simulation, themes, source display, and visual regression capture
  are intentionally deferred.

## Risks and Open Questions

- Eager discovery includes every demo in production output. If the playground
  should later be development-only, gate both discovery and route selection at
  build time or create a separate Vite entry rather than relying on dead-code
  elimination accidentally removing it.
- Source-path IDs can change when files move, invalidating saved deep links.
  Explicit IDs would improve rename stability but add authoring overhead; the
  source path is the simpler initial contract.
- Rendering all scenarios for a demo at once is convenient but expensive demos
  could slow the page. Add lazy mounting only after this becomes measurable.
- A failing scenario can currently disrupt the selected demo. Solid does not
  provide React-style error boundaries with identical behavior; investigate a
  scenario boundary when the first real failure-isolation need appears.
- Components that depend on application services must provide their own test
  registry or context wrapper. A playground-wide service container would hide
  dependencies and is deliberately out of scope.

## Verification

Run:

```bash
cd ui
pnpm check
pnpm test
pnpm build

cd ..
nao check
nao --restart
```

Manually open `http://localhost:5173/#playground` and verify demo navigation,
scenario interaction, reloadable hashes, browser back/forward, the return link,
and compact layouts at desktop and narrow widths. Confirm the default URL still
opens the workspace, existing `#/views/...` routes continue to work, and links
can switch between the workspace and playground without a document reload.

Automated verification completed on 2026-08-30. Type checking, 67 tests across
21 files, and the Vite production build pass. Tests cover discovery validation,
ordering, empty libraries, route encoding, stale and malformed hashes, scenario
navigation, root application switching, Badge behavior, and existing workspace
behavior. The playground includes Badge, Icon Button, and Data Table demos.
Responsive styling is implemented through a CSS module; a separate browser
viewport screenshot pass was not available in the current environment.
