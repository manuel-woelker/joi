# Tree Component Plan

## What are we building?

Add a reusable SolidJS tree component under `ui/src/components/tree/`. The
component accepts a logical tree model separately from a rendering definition,
supports multiple node kinds, and selects a registered renderer by each node's
kind. `folder` is the built-in container kind and can be opened and closed.

The tree component owns hierarchy, expansion, focus, keyboard interaction, and
accessibility semantics. Kind renderers own only the visible row content. This
keeps custom renderers flexible without requiring every consumer to correctly
reimplement tree behavior.

Use the existing saved-view navigation as the first integration target. Its
workspace remains the source of truth; adapt its folders and views into the
generic model and keep context menus and view-selection behavior in the
saved-view renderer definitions. Do not move domain operations into the tree
component.

## What should the logical model look like?

Use branded node and kind identifiers and a normalized model so child lookup is
independent of rendering:

```ts
type TreeNodeId = string & { readonly __treeNodeId: unique symbol };
type TreeNodeKind = string & { readonly __treeNodeKind: unique symbol };

interface TreeNode {
  readonly id: TreeNodeId;
  readonly kind: TreeNodeKind;
  readonly data: Readonly<Record<string, unknown>>;
  readonly children?: readonly TreeNodeId[];
}

interface TreeModel {
  readonly roots: readonly TreeNodeId[];
  readonly nodes: ReadonlyMap<TreeNodeId, TreeNode>;
}
```

Keep nodes normalized in a map and represent roots and children as ID
references. This requires slightly more setup than nested node objects, but it
is the better fit for application trees whose entries already have stable IDs:

- Node lookup for focus, selection, activation, and updates is direct instead
  of requiring recursive traversal.
- Expansion and focused-row state remain stable object-independent ID sets.
- Reordering or moving a subtree changes only the relevant ID lists rather than
  rebuilding nested objects.
- The model can reference existing normalized domain state, including the
  saved-view workspace, without introducing a second nested source of truth.
- Validation can report missing references, duplicate placement, cycles, and
  unreachable nodes explicitly at the component boundary.

The component may derive a flat visible-row list for rendering and keyboard
navigation, but that is transient view state and does not replace the logical
node map.

Expose constructor functions for branded IDs and a model validation function.
Validation should reject missing roots or children, duplicate child placement,
self-reference, cycles, unreachable nodes, folders without `children`, and
non-folder nodes with `children`. Errors should include actionable node IDs.
Treat the model as immutable input; opening a folder must not mutate it.

Only folders have children in the initial API. Supporting arbitrary expandable
kinds would blur the distinction between node data and tree topology without a
current use case. Keep the model deliberately non-generic: consumers can read
their known data shape in the renderer, while the tree itself only needs IDs,
kinds, and folder children.

## How should rendering be defined?

Keep rendering configuration in a separate `TreeDefinition` containing one
renderer per kind. A renderer receives the node and a small row context, and
returns JSX for the row body:

```tsx
interface TreeNodeRenderContext {
  readonly level: number;
  readonly expanded: boolean;
  readonly selected: boolean;
}

type TreeNodeRenderer = (
  node: TreeNode,
  context: TreeNodeRenderContext,
) => JSX.Element;

interface TreeDefinition {
  readonly renderers: ReadonlyMap<TreeNodeKind, TreeNodeRenderer>;
  readonly isSelected?: (node: TreeNode) => boolean;
  readonly onActivate?: (node: TreeNode) => void;
  readonly onContextMenu?: (event: MouseEvent, node: TreeNode) => void;
}
```

Provide a small renderer-registry builder keyed by `TreeNodeKind`. Its `build()`
step rejects duplicate registrations, and rendering reports an actionable
error when a model contains an unregistered kind. Include a built-in folder
renderer using the Lucide folder icons and a caller-provided folder label
function; callers may replace it when they need richer folder rows. Consumers
that want typed data access can define a narrow type guard beside their
renderer instead of parameterizing the entire tree API.

The `Tree` renders row containers, indentation, disclosure controls, selection
state, and tree semantics around renderer output. Renderers must not emit their
own `treeitem` elements or manage expansion. Avoid a plugin extension point for
the first version: these renderers configure a component instance, not the
application globally, and a global registry would add hidden coupling.

## How should expansion and interaction work?

Support both controlled `expanded: ReadonlySet<TreeNodeId>` plus
`onExpandedChange`, and an uncontrolled `defaultExpanded` mode. Copy sets on
updates so Solid observes changes. Expansion is keyed by stable node IDs and
folder state is retained when a parent closes.

Clicking a folder's disclosure control toggles it. Activating a leaf calls the
definition callback. Keyboard behavior follows the ARIA tree pattern:

- Arrow Down/Up moves through currently visible nodes.
- Arrow Right opens a closed folder, then moves to its first child when open.
- Arrow Left closes an open folder, then moves to its parent when closed.
- Home/End moves to the first/last visible node.
- Enter activates the focused node; Space toggles a folder.

Use roving `tabindex` scoped to the component instead of querying all tree rows
from `document`. Keep focus valid when a focused descendant becomes hidden by
moving it to the folder being closed. Mouse activation should also update the
roving focus target.

## Implementation Checklist

- [x] Add branded tree node/kind IDs and a concrete immutable normalized model
      under `ui/src/components/tree/`.
- [x] Add pure model validation for missing references, duplicate placement,
      self-reference, cycles, unreachable nodes, and invalid child ownership.
- [x] Add a renderer-registry builder with duplicate-registration errors and
      useful missing-renderer diagnostics.
- [x] Add the built-in folder kind and default folder renderer while allowing a
      tree definition to override its visual content.
- [x] Implement visible-node flattening with level and parent metadata, based
      only on the model and expanded folder IDs.
- [x] Implement controlled and uncontrolled expansion without mutating the
      logical model.
- [x] Implement scoped roving focus, click activation, folder disclosure, and
      Arrow/Home/End/Enter/Space keyboard behavior.
- [x] Add `tree`, `treeitem`, and `group` semantics, `aria-expanded`, selected
      state, accessible disclosure labels, and appropriate icon decoration.
- [x] Add a CSS module using application color tokens, compact spacing, stable
      indentation, ellipsis for long labels, and visible hover/focus/selection
      states.
- [x] Add tests for model validation, renderer dispatch, declaration order,
      nested folder expansion, controlled state, visible traversal, focus after
      collapse, activation, context menus, and missing renderers.
- [x] Add a colocated `Tree.demo.tsx` with scenarios for mixed custom kinds,
      nested open/closed folders, controlled expansion, custom row rendering,
      selection, long labels, and an empty tree.
- [x] Adapt `SavedViewNavigation` to the reusable tree while retaining its
      current icons, selection, context menus, folder persistence, and commands.
- [x] Document the model/definition split, renderer registration, expansion
      modes, and accessibility behavior in `ui/README.md`.
- [x] Run focused UI tests, type checking, and production build, then run
      `nao check` and restart active development tasks with `nao --restart`.

## How will we verify it?

- Models can be reused with different renderer definitions without changing
  node data, and changing a renderer cannot alter the logical hierarchy.
- Every visible kind uses its matching renderer and incomplete definitions fail
  before rendering with an actionable kind name.
- Nested folders open and close by pointer and keyboard in controlled and
  uncontrolled scenarios.
- Focus traverses only visible rows and remains inside the tree after collapse.
- Saved views retain selection, context menus, icons, persisted expansion, and
  navigation behavior after adopting the component.
- Playground scenarios remain usable at narrow and desktop widths with no
  clipped labels, overlapping controls, or layout movement during expansion.

## What assumptions and risks remain?

- Node kinds are known when a renderer definition is built. Dynamically loaded
  plugin kinds can construct a definition after plugin initialization; they do
  not require a global renderer extension point yet.
- Folder labels belong to rendering data, not the generic folder contract. This
  permits the same hierarchy to be rendered with different labels or controls.
- Selection is derived by the caller and activation is delegated to it. The
  tree does not own URL navigation or selected domain state.
- The first version does not include drag-and-drop, inline rename, lazy child
  loading, multi-selection, checkboxes, or type-ahead search. Each affects the
  interaction contract and should be added only with a concrete consumer.
- Renderer coverage is checked at runtime because the intentionally
  non-generic model permits open-ended kinds. Validate definitions before the
  first render and include the missing kind in errors.
- Migrating saved views increases the initial scope but prevents two subtly
  different tree interaction implementations from remaining in production.

## Implementation Record

Implemented on 2026-09-11. The focused tree suite passes 18 tests across three
files. Repository checks pass with 177 UI tests across 48 files, and the Vite
production build succeeds after transforming 162 modules. Active development
tasks were restart-requested with `nao --restart`.

The saved-view navigation now adapts its normalized workspace into `TreeModel`
and persists controlled expansion through `WorkspaceController`. Automated
tests cover interaction and structural behavior. The playground includes
mixed-kind, controlled-expansion, context-menu, and empty-tree scenarios; a
separate manual viewport inspection was not available in this environment.
