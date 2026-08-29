# Generalized Master-Detail Edit View Plan

## What are we building?

Create a reusable SolidJS master-detail view for records returned by the
generic query API. The master table stays on the left and an optional edit pane
opens on the right when a row is selected. Use the component for saved ticket
views and the Users administration view.

The shared implementation must operate on `QueryResult`, column handles, a
record identity, and declarative field definitions. It must not introduce
`Ticket`, `User`, or materialized row-object types. The first version supports
the backend's existing string and integer values, text inputs, multiline text,
and atomic updates through the generic `mutate` command.

## How should the shared model look?

Define a record editor descriptor at the view boundary:

```ts
interface EditFieldDefinition {
  readonly attribute: string;
  readonly label: string;
  readonly control: "text" | "textarea" | "integer";
  readonly required?: boolean;
  readonly rows?: number;
}

interface MasterDetailDefinition {
  readonly tableName: string;
  readonly identityAttribute: string;
  readonly detailTitle: string;
  readonly fields: readonly EditFieldDefinition[];
}
```

Keep attribute names in descriptors because they cross query, persistence, and
plugin boundaries. Bind them once to response-local `QueryColumnHandle`s after
loading a result. Continue to use branded indexes and handles internally; do
not persist response-local indexes or expose unbranded array positions.

The reusable component should receive:

- A query resource or loader returning `QueryResult`.
- Resolved table columns and optional domain-specific cell renderers.
- A stable identity column.
- The editor definition.
- Current selected record ID and selection/close callbacks.
- Optional master toolbar and client-side row transformation for saved views.

Keep unsaved form values local to the detail editor. Do not place drafts in a
global Solid store. The query result remains the canonical client-side snapshot;
after a successful mutation, refetch it once so both table and editor receive
the same server-confirmed values.

## How should querying and mutation work?

Add a generic `loadRecord` helper that queries any table by its identity
attribute and ID. Add a generic `updateRecord` helper that converts typed field
values into the existing tagged mutation columns and submits one atomic update
step to `/api/mutate`.

Validate editor bindings before rendering:

- The identity and editable attributes must exist in the query response.
- Field controls must be compatible with the returned column value type.
- Duplicate editable attributes are rejected.
- The identity value must be a string for the current backend update contract.

Do not infer controls from values. Explicit field descriptors produce stable
forms and leave room for future controls such as enums, dates, references, and
custom plugin-provided editors.

## How should navigation work?

Replace ticket-specific navigation state with a generic record selection that
retains its owning application view:

```ts
type RecordSelection = {
  type: "record";
  owner: { type: "view" | "administration"; id: string };
  recordId: string;
};
```

Use owner-specific URL hashes so selection survives reloads:

```text
#/views/<view-id>/records/<record-id>
#/administration/<entry-id>/records/<record-id>
```

Expose generic `selectRecord(owner, recordId)` and `closeRecord(owner)` methods.
Remove `selectedTicketId` and `selectTicket`. Navigation-tree highlighting must
continue to use the owning saved view while its record is open. Administration
entries should remain selected while their records are open.

## How will tickets and users migrate?

For tickets:

- Keep the saved query, transient search, presentation columns, status badge,
  and list/table configuration.
- Configure `tickets`, identity attribute `id`, and editable fields `title`
  (text) and `description` (textarea).
- Make table and list rows open the generic record route.
- Remove `TicketWorkspaceContent`, `TicketDetail`, and ticket-specific
  load/update helpers after their behavior is represented by shared modules.

For users:

- Configure `users`, identity attribute `id`, compact columns `username` and
  `name`, and editable text fields for `username` and `name`.
- Keep the internal ID hidden from the visible table and form while using it
  for row identity and updates.
- Open user details at the administration-owned record route and retain the
  Users entry selection while editing.

The component controls the responsive two-pane shell and common loading,
missing-record, save, success, and failure states. Ticket status rendering,
saved-view filtering, labels, and other domain presentation remain outside the
shared component.

## Implementation Checklist

- [ ] Add shared editor definition types and binding validation for identity,
      editable fields, duplicate attributes, and field/value compatibility.
- [ ] Add generic typed mutation request builders plus `loadRecord` and
      `updateRecord` helpers using `FetchService`, `/api/query`, and
      `/api/mutate`.
- [ ] Add unit tests for string and integer updates, malformed definitions,
      missing attributes, type mismatches, and exact wire payloads.
- [ ] Implement a generic record edit form that initializes a local draft from
      resolved column handles and supports text, textarea, integer, required,
      saving, saved, and error states.
- [ ] Implement the reusable master-detail shell with a flexible left pane, a
      bounded right pane, accessible row activation and close command, and a
      narrow-screen stacked layout.
- [ ] Ensure one shared query resource owns the visible records and is
      refetched after save, preventing stale values between table and detail.
- [ ] Generalize navigation selection and hash parsing for records owned by
      saved views and administration entries; retain owner highlighting and
      support reload, close, and back/forward navigation.
- [ ] Migrate saved ticket views to the shared shell while preserving table and
      list presentations, search, status rendering, result counts, and view
      configuration commands.
- [ ] Migrate Users to the shared shell with editable username/name fields and
      hidden immutable IDs.
- [ ] Remove ticket-specific detail layout, editor, route state, and redundant
      API helpers once both migrations pass.
- [ ] Add component tests for mouse and keyboard row selection, both URL forms,
      owner highlighting, reload restoration, editing tickets and users,
      server errors, close behavior, and table refresh after save.
- [ ] Update `ui/README.md` with the generic master-detail contract, extension
      points for custom fields, and current limitations.

## What assumptions does the plan make?

- The first query result includes every editable attribute and the identity
  attribute, even when some are hidden from the table.
- IDs remain immutable strings and are the keys accepted by the backend update
  mutation.
- Users may edit `username` and `name`; uniqueness validation for usernames is
  a backend responsibility.
- Saving sends all configured editable values in one atomic mutation. Dirty
  field tracking and partial patches are unnecessary at this scale.
- There is one selected record per application view. Multi-selection and
  multiple simultaneous editors are out of scope.
- The right pane stacks below the table at the existing responsive breakpoint;
  it does not become a modal or overlay in this iteration.

## Risks and Open Questions

- A fully schema-generated form would be overengineered now. Keep the initial
  control union small and provide a future custom-renderer seam only when a
  second nontrivial field type requires it.
- Refetching an entire query after every save is simple and consistent but may
  become expensive with pagination or large tables. A normalized entity cache
  can be added later if measured latency warrants it.
- Saved ticket views can use list or table presentations. The left pane should
  therefore accept a renderer or composed master content instead of assuming
  that every master is a `DataTable`.
- Query filters can exclude a record after it is edited. After refetch, close
  the detail pane with a clear status if the selected record no longer belongs
  to the result, rather than displaying stale data.
- Browser back/forward behavior must remain authoritative. Components should
  derive selected records from navigation state and must not maintain a second
  independent selection signal.

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

Manually verify at desktop and narrow widths that ticket and user rows open a
right-side editor without hiding the table, direct record URLs survive reload,
navigation highlighting remains correct, browser back/forward works, closing
returns to the owner view, successful saves refresh both panes, failed saves
retain the draft, and internal IDs never become visible fields.
