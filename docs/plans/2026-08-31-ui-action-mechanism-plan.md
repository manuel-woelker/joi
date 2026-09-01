# UI Action Mechanism Plan

## What are we building?

Add a plugin-contributed UI action mechanism for commands that users trigger
against the current application context. Each action has a branded ID, label,
description, optional single-key hotkey, availability predicate, and async
execution function. Actions are registered through a new UI extension point
and remain independent of navigation, rendering, and backend transport.

The first contribution is **Assign to me** for a selected ticket. It uses the
`i` hotkey, assigns the authenticated user, and updates interested UI state
without requerying or flickering. Selecting a ticket for an action and running
the action must not open the edit form.

Use `Action` for user-triggered UI behavior even though the backend uses
`Command`. The concepts have different scopes: UI actions are contextual,
plugin-contributed interactions; backend commands are transport endpoints.

## What should the action contract look like?

Define a focused contract under `ui/src/actions`:

```ts
type ActionId = string & { readonly actionIdBrand: unique symbol };

interface UiAction {
  readonly id: ActionId;
  readonly label: string;
  readonly description: string;
  readonly hotkey?: string;
  readonly compatibleEntityTypes?: readonly string[];
  isAvailable(context: ActionContext): boolean;
  execute(context: ActionContext): void | Promise<void>;
}
```

`ActionContext` contains the authenticated user and an optional active target.
Start with one target variant for a selected entity record:

```ts
interface EntityRecordActionTarget {
  readonly type: "entity-record";
  readonly entityId: string;
  readonly recordId: string;
  readonly values: Readonly<Record<string, QueryValue>>;
  update(changes: Readonly<Record<string, QueryValue>>): Promise<void>;
}
```

The target exposes capability-oriented values and mutation rather than
`QueryResult`, `FetchService`, form internals, or ticket-specific types. This
keeps the action mechanism data-model agnostic and gives every mutation one
owner. Add target variants only when a real second action category needs one.

`compatibleEntityTypes` is an optional declarative coarse filter over
`EntityRecordActionTarget.entityId`. Omit it for actions that are global or
support non-entity targets. When present, the framework requires an entity
record target whose entity ID is listed before evaluating `isAvailable`.
`isAvailable` remains responsible for dynamic conditions such as permissions,
current values, or application state. Reject empty lists, blank IDs, and
duplicate IDs; an empty list is more likely a configuration error than an
action that can never run.

Create `actionContributions` as an `ExtensionPoint<UiAction>`. A core actions
plugin registers the extension point; feature plugins register actions during
the existing second plugin phase. Validate non-empty IDs, labels, and
descriptions, normalized one-character hotkeys, duplicate action IDs, and
duplicate hotkeys. Also validate compatible entity-type lists as described
above. Fail registry construction with action-aware messages rather than
choosing a winner based on plugin order.

## How should selection and action state reach the UI?

Add an `ActionProvider` inside the authenticated application shell. It receives
the immutable plugin registry and current user, resolves contributed actions,
and owns the current target plus execution state. Expose narrow hooks for:

- registering and cleaning up the active target;
- reading available actions in deterministic label order;
- executing an action by ID;
- reading pending action and last execution error.

The owning ticket view registers an `entity-record` target from its selected
table row. Add controlled row selection to `DataTable` and keep that selection
separate from the hash route that opens a record editor. A single row click
selects and highlights the row; an explicit Edit command, double click, or
Enter opens details. On narrow screens, expose Edit as a visible command rather
than relying only on double click. Loading a record edit URL also selects that
record, but selecting or acting on a row does not change the URL by itself.

The view replaces the action target when another row is selected and clears it
when the query/view changes or the selected row disappears. No selected row
means no target and therefore no ticket actions. The action provider owns only
the generic active target; table selection remains local to the owning view so
it does not become another application-wide navigation model.

Render available actions in the existing view-heading command area after the
view's own commands. Use compact text buttons because action labels are domain
commands, show the description and hotkey in an accessible custom menu or
tooltip, disable duplicate execution while pending, and surface failures near
the action controls without opening or closing the editor. Do not hide action execution
behind the debug UI or add a command palette in this iteration.

## How should hotkeys work safely?

Install one `keydown` listener in `ActionProvider`, not one listener per
action. Normalize hotkeys to lower-case `KeyboardEvent.key` values and trigger
only an available action whose hotkey matches.

Do not trigger actions when:

- focus is in an input, textarea, select, or contenteditable element;
- Ctrl, Alt, Meta, or Shift is held;
- the event is composing or has already been handled;
- the matching action is already executing.

Call `preventDefault()` only after a matching action is accepted. Add the
hotkey to the visible action presentation and its accessible description.
Tests should dispatch keyboard events through `document` because the provider
owns the global listener.

## How should data changes be published?

Add an application-scoped `DataChangeService` with explicit subscription and
an unsubscribe return value:

```ts
interface DataChange {
  readonly tableName: string;
  readonly recordId: string;
  readonly changes: Readonly<Record<string, QueryValue>>;
  readonly source?: ActionId;
}

interface DataChangeService {
  subscribe(filter: DataChangeFilter, listener: (change: DataChange) => void): () => void;
  publish(change: DataChange): void;
}
```

Filters support table name and optional record ID. Deliver notifications
synchronously in registration order only after backend persistence succeeds.
Snapshot listeners before dispatch so listeners may unsubscribe safely during
a callback. One failing listener must not prevent other listeners from seeing
the committed change; report listener errors through the UI logging path
rather than turning a successful backend write into a failed action.

Provide this service through the existing typed plugin service mechanism and
inject it into the mutation coordinator and interested systems. Do not use DOM
custom events or a module-global emitter; subscriptions should be explicit,
scoped, disposable, and mockable in tests.

Initial subscribers are:

- ticket query results, which write changed values into matching rows;
- an open record form for the same table and ID, which reconciles saved fields;
- future query caches, counters, or secondary views without coupling them to
  action implementations.

## How should mutations stay coherent?

Refactor the existing editor update path into one record-mutation controller
used by both form autosave and action targets. It must:

- serialize changes through the existing generic mutate command;
- serialize concurrent edits and action execution instead of racing requests;
- publish one `DataChange` only after successful persistence;
- let subscribed query results update matching rows without refetching;
- let an open form for that record update its saved baseline and visible fields;
- preserve unrelated dirty form fields;
- expose pending/error state to the caller.

Do not let the Assign to me action call `FetchService` or publish changes
directly. Independent mutation code could publish before persistence, leave
the form baseline stale, or race autosave. Add a small reconciliation API to
the form model that applies subscribed, externally saved values only to the
affected attributes and keeps other dirty values intact.

For **Assign to me**, declare `compatibleEntityTypes: ["tickets"]`; its dynamic
availability only needs to confirm any additional runtime conditions. It then
executes:

```ts
await target.update({ assignee: context.currentUser.id });
```

Keep the action available whenever a ticket is selected, including when it is
already assigned to the current user. In that case execution may complete as a
no-op and announce that no change was needed. This keeps availability rules
predictable and leaves room for a later complementary Unassign action.

## Where should the first action live?

Create a dedicated ticket-actions UI plugin directory under `ui/src/plugins`
or the existing ticket feature area, following the one-plugin-per-directory
convention. The plugin contributes Assign to me to `actionContributions` and
contains its tests beside the contribution. It requires no fetch service
because persistence is supplied by the target capability.

Keep action framework code in `ui/src/actions`; keep ticket eligibility and
the `assignee` attribute name in the ticket action plugin. Document the generic
extension contract and hotkey restrictions in `ui/README.md`.

## Implementation Checklist

- [x] Add branded action IDs, hotkey normalization, compatible entity-type
      metadata, `UiAction`, action context, entity-record target, and action
      extension-point types.
- [x] Add a core actions plugin that registers the extension point and validate
      action metadata, duplicate IDs, and duplicate normalized hotkeys.
- [x] Implement `ActionProvider` and hooks for target registration, available
      actions, pending/error state, and guarded execution.
- [x] Add controlled single-row selection to `DataTable`, selection styling,
      an explicit Edit command, and selection cleanup when rows/views change.
- [x] Add one global hotkey dispatcher with editable-element, modifier,
      composition, availability, and pending guards.
- [x] Refactor record updates into a shared mutation controller that serializes
      writes and publishes committed changes without refetching.
- [x] Implement the typed `DataChangeService`, plugin service registration,
      filtered subscriptions, safe unsubscription, ordered delivery, and
      listener-error isolation.
- [x] Subscribe query results and open forms to relevant committed changes;
      preserve unrelated dirty fields and focus during form reconciliation.
- [x] Register the selected table row as the active action target independently
      of editor visibility, and synchronize edit-route records back to selection.
- [x] Render available actions in the view command area with labels,
      descriptions, hotkey hints, pending state, and accessible errors.
- [x] Add the ticket action plugin contributing Assign to me with hotkey `i`.
- [x] Add unit tests for action validation, availability, execution, hotkey
      guards, compatible entity filtering, duplicate prevention, failures, and
      target cleanup.
- [x] Add integration tests proving Assign to me updates the backend payload,
      ticket table, subscribed assignee combobox when already open, and saved
      form baseline without opening an editor, refetching, or losing focus.
- [x] Add application tests for mouse and `i` activation, no selection, input
      focus, an already assigned ticket, navigation between records, and
      backend failure.
- [x] Document action contributions and hotkey behavior in `ui/README.md`.

## What assumptions does the plan make?

- “When a ticket is selected” means its table row is highlighted. This is
  intentionally independent from whether its detail pane is open.
- The current authenticated user ID is a valid value for `tickets.assignee`.
- Actions are visible commands as well as hotkeys; keyboard-only discovery is
  insufficient UX.
- Only one action executes at a time initially. Parallel actions can be added
  later if independent targets demonstrate a need.
- Action labels are sorted alphabetically because no explicit ordering was
  requested. Add an order field only when product requirements need one.
- Compatible entity types use the existing entity-description IDs such as
  `tickets` and `users`; introducing a second entity-type registry would add no
  useful safety yet.

## What risks and open questions remain?

- Table selection semantics change from click-to-edit to click-to-select, with
  explicit edit activation. This needs careful keyboard and mobile UX testing
  so editing does not become harder while actions remain independently usable.
- The mutation coordinator and subscription reconciliation are the
  highest-risk parts; duplicate subscriptions, stale cleanup, or out-of-order
  writes could produce stale form values or last-write-wins data loss.
- A process-local subscription only informs this browser tab. Cross-user and
  cross-tab updates eventually require server push or invalidation; do not
  present this service as a replacement for backend change notifications.
- Hotkey `i` must not fire while users type in the ticket title, description,
  search field, or assignee combobox. Shadow DOM editors would require a more
  robust composed-path check later.
- A visible action area can become crowded as plugins add actions. A compact
  overflow menu is preferable once several actions exist, but one action does
  not justify building a command palette now.
- The current backend has no authorization layer for assignment. UI
  availability is convenience, not security; backend authorization must be
  enforced separately before this becomes a multi-user production system.
- Product confirmation is not required for Assign to me because it is
  reversible through the assignee editor. Destructive actions should extend
  the contract with confirmation metadata only when first needed.

## How will we verify it?

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

Manually select assigned and unassigned ticket rows and invoke Assign to me by
button and `i`. Confirm selection and assignment do not open the editor, the
table updates immediately after a successful request, and an editor that was
already open receives the same committed change. Verify unrelated dirty fields
and keyboard focus remain intact, no query refetch occurs, failures remain
visible and retryable, and the hotkey does nothing while typing or when no
ticket is selected. Exercise click, explicit Edit, double click, Enter, mobile
Edit, browser Back/Forward, row removal, and view changes; confirm selection,
editor visibility, subscriptions, and action availability stay coherent.
