# Navigation Accordion Plan

## What are we building?

Replace the current collection of independently rendered sidebar sections with
one compact navigation accordion. Its sections appear in this fixed order:

1. **My workspace** is always first and contains the user's editable folder and
   saved-view tree.
2. **Recently used** is always second and contains a flat, most-recently-used
   list of up to eight views.
3. Plugin-contributed system sections follow, ordered by their contribution
   order and name. Each section contains a system-owned tree. Initial sections
   are **Tickets** and **Administration**.

My workspace remains expanded. Recently used can be collapsed independently.
System sections use accordion behavior, with at most one expanded at a time;
selecting a view opens its owning section. Persist collapsed state locally.

System trees are read-only navigation definitions. Their folders organize the
section and their leaf nodes open views. A copy command on a leaf adds a
separate editable instance to My workspace. Do not retain a separate favorites
concept.

## How should plugins contribute navigation?

Replace arbitrary `navigationSections` components with a small data-only
extension point owned by the core navigation plugin:

```ts
interface NavigationSectionContribution {
  readonly id: NavigationSectionId;
  readonly label: string;
  readonly order: number;
  readonly roots: readonly NavigationRootContribution[];
}

type NavigationRootContribution =
  | NavigationFolderContribution
  | NavigationLeafContribution;

interface NavigationFolderContribution {
  readonly id: NavigationEntryId;
  readonly type: "folder";
  readonly label: string;
  readonly icon?: IconComponent;
  readonly children: readonly NavigationRootContribution[];
}

interface NavigationLeafContribution {
  readonly id: NavigationEntryId;
  readonly type: "leaf";
  readonly label: string;
  readonly description?: string;
  readonly icon?: IconComponent;
  readonly selection: NavigationSelection;
  readonly copyToWorkspace?: () => WorkspaceViewDraft;
}
```

Use branded section and entry IDs and validate empty IDs, duplicates, invalid
orders, missing children, and duplicate entries during plugin initialization. A
plugin contributes only complete root entries to a section; it cannot inject a
child into another contribution's folder. Roots may contain folders recursively,
so sections can have useful structure without a cross-plugin tree mutation API.
The navigation host converts these subtrees to the existing normalized
`TreeModel`. Plugins continue to own view resolvers and content; leaf nodes only
describe how to reach a view.

`copyToWorkspace` exists only on leaves and is optional because not every system
destination has a useful saved-view representation. It returns the query,
presentation, view metadata, and optional preferred parent as a plain draft.
Folders cannot navigate, be copied, or appear in Recently used. The workspace
controller owns ID allocation, validation, persistence, and insertion. This
avoids exposing workspace mutation APIs to plugins or coupling the shell to
ticket definitions.

The shell renders one core `ApplicationNavigation` component. Tickets
contribute ticket discovery views, and Administration contributes Users and
Projects entries. Remove the old component-valued navigation extension point
after all existing contributors and dynamic-plugin tests use the new contract.

## How should My workspace change?

Continue to adapt `WorkspaceDocument.navigation` into the existing normalized
`TreeModel`. Rename the visible section to **My workspace** and keep its create,
rename, duplicate, delete, and context-menu operations.

Remove `favorites` from `WorkspaceDocument`, controller methods, rendering,
fixtures, and default contributions. Bump the persisted document to version 4
and migrate valid version 3 documents by dropping only `favorites`; preserve
all user-created queries, presentations, views, folders, ordering, and expanded
folder state. A missing or invalid workspace still falls back to contributed
defaults with the existing warning behavior.

Move initial ticket discovery definitions such as Active issues into the
Tickets system section. Keep existing persisted workspace entries untouched.
For a new workspace, avoid duplicating every system view in My workspace; seed
only the smallest useful starter layout, or leave it empty if the empty-state
copy affordance is clear. Store an optional source navigation entry ID on copied
views so the UI can prevent accidental duplicate copies and offer **Show in My
workspace** when an entry was already copied.

## How should recently used work?

Introduce a small `RecentViewsController` in the core navigation plugin. Store
only stable references, not copied labels or icons:

```ts
type RecentViewReference =
  | { readonly type: "workspace"; readonly viewId: ViewId }
  | { readonly type: "system"; readonly entryId: NavigationEntryId };
```

Resolve each reference against the current workspace and contributed system
leaf nodes when rendering. Silently discard stale references. Folder nodes are
never recorded. On successful leaf navigation, remove an existing matching
reference, prepend it, and truncate the list to eight entries. Record browser
back/forward and direct hash navigation, not only row clicks. Normalize record
and create routes to their owning leaf so opening several records does not
create duplicate recent entries.

Persist the list in local storage, scoped by the authenticated user ID when it
is available. Recently used is flat, cannot be reordered, and has no folders.
Its context menu only needs **Remove from recently used**. Selecting an entry
navigates through the existing URL-hash navigation controller.

## How should tree drag and drop work?

Extend `Tree` with one optional, domain-neutral move contract:

```ts
interface TreeMoveTarget {
  readonly parentId?: TreeNodeId;
  readonly index: number;
}

interface TreeMoveDefinition {
  canMove(node: TreeNode): boolean;
  canMoveTo(node: TreeNode, target: TreeMoveTarget): boolean;
  move(node: TreeNode, target: TreeMoveTarget): void;
}
```

When this definition is absent, the tree has no drag behavior. Use pointer
events and render the dragged row in its prospective position rather than only
showing a line. Derive the target by removing the dragged subtree from the
visible model and finding the parent/index under the pointer. Reject moves into
the dragged node's descendants and no-op positions. Distinguish dropping before
or after a row from dropping inside an expanded folder, and auto-expand a
closed folder after a short hover delay.

Apply dragging only to My workspace. The workspace controller translates the
generic parent/index target into one immutable workspace update and persists it.
Retain context-menu move commands as the keyboard-accessible alternative; do
not add cross-tree dragging from system sections in this iteration. Copying via
an explicit command is easier to understand and keeps the plugin API small.

## How should the accordion behave?

Create a focused accordion component inside the core navigation plugin rather
than adding accordion behavior to `Tree`. Section headers are buttons with
`aria-expanded` and `aria-controls`; their panels use stable IDs. The keyboard
Tab order follows visual order, while Enter and Space toggle the focused
section.

My workspace's header includes its existing compact create menu. System trees
use the existing `Tree`, including folder expansion and keyboard traversal, but
do not enable its move contract. Leaf context menus expose **Copy to My
workspace** only when supported; folder context menus do not offer copying.
Recently used is rendered as a flat tree of leaf references for consistent
focus and selection behavior. The accordion itself owns only section
expansion.

Keep each section body independently scrollable only when necessary, while the
accordion fills the fixed sidebar height. Ensure the active row remains visible
after hash navigation and a newly opened section scrolls into view without
moving the header or status bar.

## Implementation Checklist

- [x] Add branded navigation section/entry IDs, recursive folder/leaf root
      definitions, the data-only contribution contract, validation, and its
      extension point in the core navigation module.
- [x] Add the `ApplicationNavigation` accordion host with fixed My workspace and
      Recently used placement plus ordered plugin sections.
- [x] Replace ticket and administration component contributions with root tree
      contributions while retaining their existing view resolvers.
- [x] Add optional copy drafts to copyable ticket system views and implement one
      validated workspace-controller operation that inserts them.
- [x] Remove favorites from UI behavior and workspace APIs; migrate persisted
      version 3 documents to version 4 without losing user content.
- [x] Add recent-view state, user-scoped persistence, hash-navigation
      tracking, owner normalization, deduplication, stale-reference cleanup,
      removal, and the eight-entry limit.
- [x] Extend `Tree` with the optional move contract, target calculation,
      prospective-position rendering, folder hover expansion, and invalid-drop
      feedback.
- [x] Connect tree moves to a parent/index workspace operation and preserve the
      existing context-menu move commands for keyboard users.
- [x] Add compact accordion, drag, drop-target, empty-state, focus, active, and
      overflow styling using existing application color variables.
- [x] Update dynamic-domain examples and plugin API documentation for the new
      declarative contribution contract.
- [x] Add tests for contribution validation and ordering, nested system folders,
      leaf-only activation/copy/history, accordion expansion, copying, workspace
      migration, MRU behavior, stale entries, hash history, tree target
      calculation, descendant rejection, and persisted reordering.
- [x] Add a playground scenario for tree dragging and retain the existing empty,
      long-label, nested-folder, and narrow-container tree scenarios.
- [x] Run focused UI tests, type checking, and production build, then run
      `nao check` and restart active development tasks with `nao --restart`.

## How will we verify it?

- My workspace and Recently used are always the first two sections regardless
  of plugin load order; Tickets and Administration follow deterministically and
  render their root subtrees with the existing Tree component.
- Opening system sections preserves accordion behavior, and direct URLs plus
  browser history reveal and select the correct entry.
- Recent entries are ordered by actual leaf navigation, capped at eight,
  deduplicated, scoped to the current user, and resilient to removed plugins or
  saved views; folders never appear there.
- Copying a supported system view creates one editable workspace view without
  modifying the system definition or silently creating duplicates.
- Workspace rows can be reordered and moved into or out of folders by pointer;
  invalid descendant drops do nothing and existing context-menu moves continue
  to work.
- Existing version 3 workspaces retain all non-favorite data after migration.
- The sidebar remains compact and usable at narrow widths, with no clipped
  context menus, hidden drop previews, or scrolling headers.

## What assumptions and risks remain?

- Plugins may contribute recursive root subtrees, but cannot contribute into an
  existing folder. Supporting cross-plugin child insertion would require folder
  ownership and ordering rules that are not justified yet.
- Cross-tree drag-to-copy is intentionally deferred. It introduces ambiguous
  move-versus-copy semantics and forces workspace concepts into the plugin API.
- Pointer dragging needs careful testing around folder indentation and scrolling.
  Keep target computation in pure functions so most behavior is testable without
  brittle pointer-event fixtures.
- Recent history is browser-local rather than server-synchronized. User-scoped
  keys avoid mixing sessions on a shared browser while keeping this iteration
  independent of backend schema changes.
- The exact starter content for a new My workspace should be chosen during
  implementation from the existing ticket defaults. Prefer an empty or minimal
  workspace over duplicating the complete Tickets system section.

## Implementation Record

Implemented on 2026-09-12. The shell now owns one accordion with fixed My
workspace and Recently used sections followed by ordered system tree
contributions. Tickets contributes nested discovery roots and Administration
derives leaf roots from its completed extension registry. System folders are
structural; only leaves navigate, enter recent history, or expose copy drafts.

The workspace schema is version 4. Version 2 and 3 documents migrate without
losing queries, presentations, views, or navigation. Favorites were removed.
Recently used references are browser-local, scoped by user ID, deduplicated,
limited to eight, normalized to route owners, and cleaned when their target no
longer exists.

`Tree` uses optional native drag events and reports normalized parent/index
targets to its owner. It shows before, after, and folder drop feedback, expands
closed folders after a short hover, rejects descendant moves, and leaves system
trees immutable. Context-menu ordering remains the keyboard-accessible fallback.
Native drag events were selected over a custom pointer state machine to keep the
component API and implementation small; touch-specific dragging can be added
when there is a concrete mobile editing requirement.

The tree playground covers drag reordering. The accordion is exercised through
the real shell integration because a playground-only version would require a
synthetic plugin registry, workspace provider, navigation provider, and storage
stack that would obscure the component rather than demonstrate it.

Navigation identity was subsequently made explicit in path-based routes.
Workspace views use `workspace/<view-ksuid>`, system leaves use
`<section>/<leaf-id>`, and recent entries prepend `recent/` to their original
destination. Route origin, rather than resolved content identity, now controls
selection, so only the tree used to navigate is highlighted.

Focused tests pass, including tree, workspace-move, recent-history, and
navigation-identity coverage. The complete repository check passes with 190 UI tests, and the Vite production
build succeeds after transforming 176 modules.
