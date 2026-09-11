# UI Extension Inspector Plan

## What should the inspector show?

Add an opt-in extension inspector to the existing debug tools. When enabled,
the application should visualize the composition boundaries that created the
current UI:

- each rendered UI extension gets a frame and a compact label containing its
  registered extension ID;
- each visual extension point gets a second, visually distinct frame and label
  containing its extension-point ID;
- extension labels use one color and appear at the top-left of their frame;
- extension-point labels use another color and appear at the bottom-right, so
  nested point and extension labels remain distinguishable;
- inspection decoration must not affect layout, scrolling, pointer handling,
  focus, or accessible content.

Only visual extension points belong in this view. Data-only registrations such
as entity descriptions, lookups, actions, saved-view defaults, and view
resolvers remain available through the existing metadata debug views but do
not receive meaningless page frames.

## How should inspection mode be controlled?

Add an `ExtensionInspectorService` owned by the core debug plugin. It exposes a
reactive enabled flag and methods to enable, disable, and toggle inspection.
Register it through the existing typed service mechanism and expose it to
components through a narrow Solid context where needed.

Add an **Extension Inspector** contribution to the frontend debug group. Its
detail view contains the inspection toggle and a short status summary. Turning
the debug panel off must not implicitly disable inspection; the user should be
able to close the panel and inspect the unobscured application. Inspection is
development-oriented and starts disabled on every page load. Do not persist it
in workspace or user settings.

`Escape` should disable inspection when it is active, unless a higher-priority
modal interaction already consumes the key. The overlay itself must use
`pointer-events: none` and must never block application controls.

## How should frames avoid changing the UI?

Do not wrap contributed components in ordinary block or inline elements: that
would alter flex, grid, table, and provider behavior. Introduce two small
instrumentation primitives:

```tsx
<InspectableExtensionPoint id={navigationSections.id}>
  <For each={sections}>...</For>
</InspectableExtensionPoint>

<InspectableExtension id={entry.id}>
  <Dynamic component={entry.value.component} />
</InspectableExtension>
```

The primitives render layout-transparent anchors (`display: contents`) and
register their owned element range with the inspector. A single portal-based,
fixed overlay layer measures those elements with `getBoundingClientRect()` and
draws frames in viewport coordinates. For fragments or components with
multiple roots, use the union of all owned root element rectangles. Ignore
empty, detached, and zero-area ranges.

Recalculate visible rectangles on inspection enablement, resize, capture-phase
scroll, and relevant DOM size changes through `ResizeObserver`. Batch reads and
writes in one `requestAnimationFrame`; do not install one global listener per
marker. Markers must unregister on Solid cleanup so route and conditional
render changes cannot leave stale frames.

Keep labels in the overlay portal rather than inside inspected containers.
This prevents clipping by `overflow`, avoids changing stacking contexts, and
keeps the labels legible over virtualized tables and shell overlays. Clamp
labels to the viewport and give the inspector layer a documented z-index above
application content but below browser-native UI.

## How does the registry expose extension identity?

The current `PluginRegistry.extensions(point)` method returns bare values and
therefore discards the registration ID and description needed by the
inspector. Add a read-only typed entry API without weakening the existing
convenience API:

```ts
interface RegisteredExtensionEntry<T> {
  readonly id: string;
  readonly description: string;
  readonly value: T;
  readonly location?: RegistrationLocation;
}

registry.extensionEntries(point): readonly RegisteredExtensionEntry<T>[];
```

Keep `extensions(point)` for data consumers and implement it by mapping the
immutable entries. Do not add debug fields to every contribution value or
require extension authors to duplicate registration IDs inside component
props. Extend registry and proxy-service tests to verify typing, ordering,
immutability, and pre-initialization failure behavior.

## Which render sites should be instrumented?

Instrument shared render boundaries rather than individual domain components:

- application-provider contributions;
- navigation-section contributions and their extension point;
- top-bar contributions and their extension point;
- shell-overlay contributions and their extension point;
- status-bar contributions and their extension point;
- administration contributions and their extension point;
- debug contributions and their extension point where they render in the
  master-detail panel.

Provider contributions have no reliable DOM box of their own because a Solid
provider may render only its children. Keep their registrations in the
existing extension-point metadata view rather than claiming the entire
descendant application as their frame. View resolvers are nonvisual; frame the
resolved `ApplicationView` only if view rendering is later promoted to a
visual extension boundary.

Use registration IDs from `extensionEntries`, not contribution-local IDs, for
labels. The extension-point frame should cover only the host area occupied by
its contributions, not unrelated controls sharing the same parent, such as the
user menu beside top-bar contributions.

## Implementation Checklist

- [x] Add typed immutable `RegisteredExtensionEntry<T>` access to
      `PluginRegistryAccess`, `PluginRegistry`, and `PluginRegistryService`,
      while retaining `extensions(point)` for existing consumers.
- [x] Add registry and deferred-service tests for entry metadata, ordering,
      immutability, and calls before registry initialization.
- [x] Create the reactive `ExtensionInspectorService`, its service key, and a
      Solid provider/hook with explicit failure behavior outside the provider.
- [x] Add marker registration for extension and extension-point ranges,
      including cleanup when contributed components unmount or change.
- [x] Implement one portal overlay that batches rectangle measurement and
      renders noninteractive, viewport-clamped frames and labels.
- [x] Define inspector colors, label positions, stacking, and fixed dimensions
      with CSS variables that remain legible in the current application theme.
- [x] Register an **Extension Inspector** frontend debug contribution with an
      enable/disable control and a current visual-boundary count. Provider-only
      and data-only registrations remain available in the metadata views.
- [x] Add `Escape` handling and ensure inspection remains active when the debug
      panel closes.
- [x] Instrument shared navigation, top-bar, shell-overlay, status-bar,
      administration, and debug contribution render sites using registry entry
      metadata.
- [x] Document the inspector, its debug-only purpose, and the distinction
      between visual and data-only extension points in `ui/README.md`.

## Verification

- [x] Unit-test service state, marker registration and cleanup, frame
      measurement, disabled-state behavior, and animation-frame updates.
- [x] Component-test extension and extension-point labels, distinct styles,
      toggle behavior, and `Escape` handling.
- [x] Verify the inspector introduces no extra accessible labels, tab stops, or
      pointer-event targets.
- [ ] Verify navigation, top-bar, status-bar, administration, debug, and overlay
      frames at desktop and mobile viewport sizes.
- [ ] Verify labels remain visible for clipped and scrollable containers and
      update correctly while scrolling and resizing the sidebar.
- [x] Check that inspection disabled has negligible rendering work and no
      rectangle reads during normal interaction.
- [x] Run UI type checking, UI tests, and a production Vite build.
- [x] Run `./t nao check`.
- [x] Restart active development tasks with `./t nao --restart`.

## Risks and Assumptions

- DOM ownership is ambiguous for fragments, portals, and provider-only
  contributions. The inspector should omit an uncertain frame and report it as
  unmeasurable rather than draw a misleading one.
- Nested extension points naturally produce overlapping frames. Different
  colors and opposite label corners are required; adding hover selection or a
  full DOM inspector would be a separate feature.
- Measuring many markers on every scroll can become expensive. One shared
  scheduler and viewport-only rendering are mandatory; optimize further only
  after profiling realistic plugin counts.
- Registration source locations already exist and can be shown in the debug
  detail, but they are not necessary in every on-canvas label. Keep labels
  compact and place richer metadata in the debug panel.
- This is a composition debugger, not a general component inspector. It should
  visualize registered UI extension boundaries only, not every Solid
  component.

## Decisions

- Reuse the existing debug contribution mechanism instead of adding a second
  developer toolbar.
- Draw frames in a fixed portal overlay so instrumentation cannot disturb
  application layout or be clipped by inspected containers.
- Preserve registration identity in a typed registry entry API instead of
  duplicating debug metadata in contribution values.
- Instrument only shared extension renderers; plugin authors should receive
  visualization automatically when contributing to a supported visual point.
- Keep inspection opt-in, nonpersistent, and disabled by default.
