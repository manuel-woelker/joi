# Generic Entity Creation Plan

## What are we building?

Add a generic create workflow for entities described by the existing UI
`EntityDescription` model. Users and tickets should use the same generated
fields, validation adapters, master-detail layout, and mutation transport as
editing, while creation remains an explicit submit operation and existing
records continue to autosave.

Represent editor state as a discriminated mode instead of a boolean:

```ts
type EntityEditorMode =
  | { readonly type: "edit"; readonly recordId: string }
  | { readonly type: "create" };
```

This keeps mode-specific data type-safe and prevents an invalid combination
such as create mode with a record ID. The shared entity editor derives the
same controls in either mode, but configures the form lifecycle and persistence
behavior from the mode.

## How should entity descriptions define creation?

Add optional creation metadata to each entity attribute. Keep it separate from
`edit`, because an immutable attribute may still be required when inserting a
record:

```ts
interface CreateAttributeDescription {
  readonly control?: EditControl;
  readonly required?: boolean;
  readonly rows?: number;
  readonly placeholder?: string;
  readonly initialValue?: QueryValue | (() => QueryValue);
  readonly hidden?: boolean;
}
```

Visible create fields use their `create` control metadata, falling back to the
existing `edit` control metadata when the two modes are identical. Hidden
attributes must provide an initial value or factory. Attribute and entity
validation continue to use the existing `ValidationFunction<T>` mechanism and
run against the complete candidate entity, including hidden initial values.

Add entity-level creation metadata only for behavior shared by the whole
record, such as the create label. Do not add component callbacks or persistence
functions to descriptions; descriptions should remain declarative and the
generic mutation layer should perform inserts.

Configure the initial entities as follows:

- Users generate a hidden KSUID, then show required `username` and `name`
  fields using their existing controls and validation.
- Tickets generate a hidden KSUID, show required `key` and `title` plus
  `description`, and initialize hidden `status` to `open`.
- Ticket keys are entered explicitly and validated as `<PROJECT>-<INTEGER>` in
  this iteration. Automatic sequence allocation requires a backend-owned,
  concurrency-safe allocator and should not be approximated in the browser.

Generate standard KSUIDs through a small Web Crypto-based function whose clock
and random source are injectable in tests. The commonly used `ksuid` package is
Node-only and imports `crypto`/`Buffer`, so it cannot be shipped by this browser
application without inappropriate polyfills. Keep generation isolated so a
future backend-generated identity can replace it without changing the form
model.

## How should explicit submission work?

Extend the form API with explicit lifecycle modes rather than inferring
behavior from the presence of callbacks:

```ts
type FormPersistence<TValues> =
  | {
      readonly type: "autosave";
      readonly onSave: (changedValues: Partial<TValues>) => Promise<void>;
    }
  | {
      readonly type: "submit";
      readonly onSubmit: (values: TValues) => Promise<void>;
    };
```

Edit mode preserves the current debounce and unmount flush behavior. Create
mode never schedules a save and never submits on unmount. Its explicit Create
button should:

- mark relevant fields touched and run attribute and entity validation;
- submit the complete candidate value set only when it is valid;
- disable duplicate submission while the request is active;
- retain entered values and display the general error when insertion fails;
- expose Cancel and Reset without issuing a request.

Keep dirty, validation, submission, and error state in the existing form model.
Use `saving` only if its meaning remains clear in both modes; otherwise rename
it to `submitting` consistently. Add form playground scenarios for explicit
submit, invalid submit, failed submit, reset, and unmount without submission.

## How should insertion and local data updates work?

Add a generic `createRecord` helper beside `updateRecord`. It converts every
candidate attribute into the existing tagged query value representation and
sends one atomic insert step to the generic `/api/mutate` command. Validate
that the candidate contains each described attribute exactly once and that
values match the declared type before sending the request.

The generated identity is known before insertion. After a successful create,
refetch the owning query and navigate to the new record's edit route. Refetching
once is preferable to manually appending a columnar row because the backend is
the authority and the new record may not satisfy the active query. Keep the
current no-refetch write-back behavior for autosaved edits.

If the new record does not appear in the active result after refetch, return to
the owning view and show a concise success message rather than opening a
missing-record pane. The default `open` ticket status should make newly created
tickets visible in the current active-issues view.

## How should creation integrate with navigation and layout?

Extend hash navigation with owner-specific create routes:

```text
#/views/<view-id>/new
#/administration/<entry-id>/new
```

Represent these as a generic create selection owned by a saved view or
administration entry. Browser history remains authoritative, so opening,
canceling, successful creation, reload, back, and forward do not require a
second local selection signal.

Add a New command to ticket views and the Users administration view. Opening
it keeps the table on the left and displays the shared editor in create mode on
the right. The editor heading and primary button use the entity's singular
label. Cancel closes the pane by navigating back to the owning view; successful
creation replaces the create route with the new record route to avoid returning
to a stale submitted form with the Back button.

## Implementation Checklist

- [x] Extend entity-description types, validation, and authoring helpers with
      declarative creation metadata, initial values/factories, and labels.
- [x] Add deterministic, injectable KSUID generation and configure complete
      create metadata for users and tickets, including ticket-key validation
      and the initial `open` status.
- [x] Extend entity editor derivation to produce create fields, complete typed
      candidate values, and the same attribute/entity validation behavior used
      by editing.
- [x] Introduce explicit autosave and submit form persistence modes; guarantee
      that submit mode never debounces, autosaves, or flushes on unmount.
- [x] Add generic Create, Cancel, and Reset controls with touched-state,
      validation, pending, success, and failure behavior.
- [x] Add `createRecord` using one atomic generic insert mutation and test its
      exact string/integer wire payloads, missing values, type mismatches, and
      backend errors.
- [x] Generalize the record editor into create/edit modes without duplicating
      field rendering, validation adapters, responsive layout, or error UI.
- [x] Add generic create selections and owner-specific hash parsing,
      serialization, close, replace, reload, and browser-history behavior.
- [x] Add New commands to saved ticket views and Users; refetch after success,
      open the created record when it remains in the result, and handle a
      filtered-out result cleanly.
- [x] Add form playground scenarios and focused tests for explicit submission,
      invalid fields, cross-field validation, reset, failed insertion,
      duplicate-submit prevention, and unmount without submission.
- [x] Add application tests for creating a user and ticket, hidden generated
      IDs, initial ticket status, visible immutable ticket key, table refresh,
      URL transitions, cancel, and unchanged edit autosave behavior.
- [x] Document entity creation metadata, explicit versus autosave lifecycle,
      and current ticket-key limitation in `ui/README.md`.

## What assumptions does the plan make?

- The existing generic mutate command accepts complete singleton insert
  columns and applies one insert step atomically.
- KSUIDs may be generated client-side for this iteration; the backend still
  enforces persistence constraints.
- Every attribute required by the physical table is either visible in the
  create form or supplied by a creation initial value/factory.
- Ticket keys are user-provided until a backend sequence allocator exists.
- Create mode uses the same entity validators as edit mode and does not add a
  separate validation framework.
- A post-create refetch is acceptable because creation is explicit and
  infrequent; the edit path retains its current flicker-free local write-back.

## Risks and Open Questions

- Client-generated KSUIDs are simple and allow immediate navigation, but
  server-generated identities would provide stronger central ownership. If the
  backend will soon generate IDs, make that change before stabilizing the
  create response contract.
- User-entered ticket keys are safe but less ergonomic. Automatic
  `<PROJECT>-<INTEGER>` keys need a transactional backend allocator; deriving
  the next number from the current query would race and should not be done.
- Required metadata currently lives near controls. If create and edit
  requirements diverge substantially, validation should move to domain-level
  entity rules rather than accumulating mode-specific `required` flags.
- Refetching can omit a newly created record because of filtering or sorting.
  Treat that as a normal query result, not an insertion failure.
- Navigation away from a dirty create form can discard input. A confirmation
  guard may improve UX, but it should be handled as a separate navigation
  feature unless existing route transitions already provide one.
- Backend uniqueness failures for usernames or ticket keys are general form
  errors unless the mutate API gains structured attribute-associated errors.

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

Manually verify user and ticket creation at desktop and narrow widths. Confirm
that no request occurs while typing, on debounce, on reset, on cancel, or on
unmount; invalid forms do not submit; failed requests preserve input; repeated
clicks cannot create duplicates; successful creation updates the table and URL;
Back and Forward remain coherent; and editing existing records still autosaves
without table flicker or focus loss.

Automated verification completed on 2026-08-30. Repository checks, TypeScript
type checking, 106 UI tests, and the Vite production build pass. Application
tests cover explicit user and ticket creation, generated hidden identities,
the initial open ticket status, post-create refetch, URL replacement, and
unchanged edit autosave behavior. A separate browser viewport pass was not
available; the create pane uses the existing tested responsive master-detail
layout.
