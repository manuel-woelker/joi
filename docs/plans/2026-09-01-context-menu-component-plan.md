# Context Menu Component Plan

## What are we building?

Add a reusable, accessible context menu component to the UI. Its grouped menu
entries are created each time the menu opens, allowing labels, disabled states,
and callbacks to reflect the current application state rather than a snapshot
taken when the caller rendered.

One application-level context-menu host owns rendering, positioning, focus,
keyboard navigation, and dismissal. Callers open it imperatively from mouse
event handlers and own entry behavior. This avoids wrappers, directives, and
context-menu-specific markup around table rows or other dynamic targets. Keep
the first iteration independent from the UI action registry so it remains
useful for local component commands; action-backed menus can adapt available
`UiAction` values into entries later.

## What should the component API look like?

Define focused contracts under `ui/src/components/context-menu/`:

```ts
interface ContextMenuEntry {
  readonly id: ContextMenuEntryId;
  readonly label: string;
  readonly keyboardHint?: string;
  readonly description?: string;
  readonly icon?: () => JSX.Element;
  readonly disabled?: boolean;
  execute(): void | Promise<void>;
}

interface ContextMenuGroup {
  readonly id: ContextMenuGroupId;
  readonly label?: string;
  readonly entries: readonly ContextMenuEntry[];
}

interface OpenContextMenuOptions {
  readonly event: MouseEvent;
  readonly createGroups: (context: ContextMenuOpenContext) => readonly ContextMenuGroup[];
}

interface ContextMenuController {
  open(options: OpenContextMenuOptions): void;
  close(): void;
}
```

Brand entry and group IDs consistently with existing UI identifiers. Preserve
group and entry declaration order. Render optional group labels accessibly;
otherwise separate adjacent non-empty groups visually. Omit empty groups.

Expose the controller through a narrow `useContextMenu()` hook backed by a
single `ContextMenuProvider` and portal host in the application shell. A caller
opens it directly from code:

```tsx
const contextMenu = useContextMenu();

<tr
  onContextMenu={(event) =>
    contextMenu.open({
      event,
      createGroups: () => createRowMenuGroups(row),
    })
  }
/>
```

Invoke the synchronous `createGroups` factory exactly once inside `open`, after
receiving the mouse event and before rendering. The controller calls
`preventDefault()` only when it accepts the custom menu. Application-specific
selection remains in the caller's closure rather than making the controller
generic over domain state. Calling `open` while a menu is visible replaces its
snapshot, position, and focus state; only one context menu exists at a time.
Capture the currently focused element before moving focus into the menu so it
can be restored after dismissal if it is still connected.

Use an icon render callback so Solid creates the JSX under the menu's ownership.
Do not add an icon package; demos can use compact text or existing visual assets.
The initial factory stays synchronous. Asynchronous fetching during opening
would make focus and dismissal timing brittle; callers should cache remote data
before opening or expose a disabled loading entry.

## How should interaction and positioning work?

Open only through `ContextMenuController.open`, initially using a native mouse
`contextmenu` event and its client coordinates. The host does not install global
opening listeners and does not wrap or discover trigger elements. Keyboard
hints describe application shortcuts; they do not register shortcuts or open
the menu. Programmatic keyboard opening can be added later with an explicit
element-rectangle anchor when a real caller needs it.

Suppress the browser menu only when at least one entry is produced. Empty menu
snapshots leave the native event untouched. A snapshot containing only disabled
entries may still open because descriptions can explain why commands are
unavailable.

Portal the menu to `document.body` so parent overflow and stacking contexts do
not crop it. Measure after rendering and constrain or flip each axis to keep the
menu within a small viewport margin. Give long menus a bounded height and
internal scrolling.

Move focus to the first enabled entry when opened. Arrow Up/Down, Home, and End
move through enabled entries; Enter and Space execute the focused entry. Escape
closes the menu and restores the previously focused element. Pointer execution
closes the menu without redirecting focus. Close on outside interaction, window
blur, and viewport changes that invalidate the anchor.

Use `menu`, `group`, and `menuitem` semantics plus `aria-disabled`. Labels are
the primary accessible names; descriptions and keyboard hints are supplementary
visible text. Disabled entries remain visible but cannot receive roving focus
or execute.

## Implementation Checklist

- [ ] Add branded IDs, entry/group contracts, open options, and controller types
      under `ui/src/components/context-menu/`.
- [ ] Add one application-scoped provider/host and expose a narrow imperative
      `useContextMenu()` controller hook.
- [ ] Implement mouse-event opening, replacement of an already open menu, and
      invoke `createGroups` exactly once inside each accepted `open` call.
- [ ] Portal the menu to `document.body` and implement measured viewport-aware
      positioning from mouse client coordinates.
- [ ] Implement outside-interaction, execution, Escape, blur, scroll, and resize
      dismissal, preserving and restoring focus where appropriate.
- [ ] Implement roving focus with Arrow Up/Down, Home/End, Enter, and Space while
      skipping disabled entries.
- [ ] Add menu, group, and menu-item semantics, group labels, accessible disabled
      state, and decorative icon handling.
- [ ] Add a dedicated CSS module using existing design tokens. Prevent label,
      description, icon, and hint overlap and constrain large menus.
- [ ] Add component tests for factory timing and current-state capture,
      imperative mouse-event opening, replacement, group order, disabled
      entries, asynchronous execute callbacks, keyboard traversal, dismissal,
      empty menus, event suppression, unmount cleanup, and viewport adjustment.
- [ ] Add playground scenarios for a basic menu; grouped entries with icons,
      descriptions, and hints; disabled and dynamically recreated entries;
      repeated programmatic opening; and a target in a clipped container near a
      viewport edge.
- [ ] Document the API, factory lifecycle, and interaction behavior in
      `ui/README.md`.
- [ ] Run `nao check` and restart active development tasks with `nao --restart`.

## How will we verify it?

- The factory runs exactly once per opening and observes state changed while the
  menu was closed.
- Mouse users can open the menu through caller code; mouse and keyboard users
  can traverse, invoke, and dismiss an open menu without unexpected focus moves.
- Disabled entries never execute through pointer or keyboard input.
- Groups and entries retain declaration order, and empty groups produce no
  labels or separators.
- The menu remains visible in clipped containers and at every viewport edge.
- Long content and all demos have no overlap at narrow and desktop widths.

## What assumptions and risks remain?

- Successful invocation closes immediately even when `execute` returns a
  promise. Execution failures remain the caller's responsibility; keeping the
  menu open as an error surface would couple it to application error handling.
- Nested submenus and checkbox/radio entries are out of scope. Their semantics
  and keyboard models warrant explicit contracts later.
- Descriptions are rendered directly rather than hidden in tooltips, preserving
  keyboard and touch access.
- Factories should cheaply derive entries from available state; they should not
  establish reactive subscriptions or issue network requests.
- A factory producing no entries does not open a custom menu. A menu containing
  disabled entries may open to communicate command availability.
- Touch long-press and keyboard-origin opening are out of scope for the initial
  mouse-event API. They should use explicit anchor variants if later required,
  rather than synthetic mouse events.
