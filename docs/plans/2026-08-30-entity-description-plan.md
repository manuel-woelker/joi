# Entity Description Plan

## What are we building?

Add a code-defined UI entity description for records such as tickets and
users. An entity description is the canonical source for its table name,
identity attribute, attribute labels and value types, default table columns,
edit controls, and validation functions. Ticket and user tables and detail
forms should be derived from these descriptions instead of maintaining
separate table-column and `MasterDetailDefinition` literals.

Keep this model in the UI. The backend `TableDescription` defines physical
storage, while the UI entity description defines presentation and interaction.
They should not be combined in this iteration: existing validation functions
are executable TypeScript and cannot be transported as JSON, and making the
backend own UI controls would couple independent layers.

Saved ticket presentations continue to select column order, density, and
width. They reference attributes from the ticket entity description and may
override a label or width. The entity supplies canonical defaults and validates
those references. Domain-specific rendering, such as the ticket status badge,
remains an explicit view-level cell renderer layered onto generated columns.

## How should entity descriptions look?

Introduce a small model under `ui/src/entities`:

```ts
interface EntityAttributeDescription<
  TAttribute extends string = string,
  TValue extends QueryValue = QueryValue,
> {
  readonly id: TAttribute;
  readonly label: string;
  readonly valueType: TValue extends string ? "string" : "int";
  readonly table?: {
    readonly visibleByDefault?: boolean;
    readonly width?: number;
  };
  readonly edit?: {
    readonly control: EditControl;
    readonly required?: boolean;
    readonly rows?: number;
    readonly placeholder?: string;
    readonly readonly?: boolean;
    readonly disabled?: boolean;
  };
  readonly validation?: ValidationFunction<TValue>;
}

interface EntityDescription<
  TAttribute extends string = string,
  TValues extends Readonly<Record<TAttribute, QueryValue>> = Readonly<Record<TAttribute, QueryValue>>,
> {
  readonly id: string;
  readonly tableName: string;
  readonly label: string;
  readonly pluralLabel: string;
  readonly identityAttribute: TAttribute;
  readonly attributes: readonly EntityAttributeDescription<TAttribute, TValues[TAttribute]>[];
  readonly validation?: ValidationFunction<TValues>;
}
```

Use a `defineEntity` helper over a const attribute tuple to infer both the
literal union of attribute IDs and each attribute's value type without
requiring repetitive generic annotations. A discriminated string/integer
attribute union is acceptable if it produces clearer inference than
conditional types. Runtime validation remains necessary because query
responses and persisted workspace presentations cross untyped boundaries.

Keep validation attached directly to attributes and entities using the current
`ValidationFunction<T>` mechanism. Attribute validators receive their declared
domain value (`string` or `number`), and entity validators receive the inferred
typed value record. Required validation is generated from the edit metadata
and called alongside an attribute's explicit validation. Entity-level
validation supports cross-field failures with or without an associated
attribute.

The existing form store holds input text. The entity-to-editor adapter must
therefore parse text controls into their declared domain values before calling
typed entity validators. Invalid integer text produces a field-associated type
failure and does not invoke the integer validator. Do not weaken entity
validators to `ValidationFunction<string>` merely to match the current control
representation.

Do not put arbitrary Solid render functions into the entity description. Table
cell renderers belong to a concrete view because they can depend on CSS modules,
view context, or application services.

## How should descriptions bind to query results?

Add pure binding functions that resolve attribute IDs against one
`QueryResult`. They should:

- reject empty or duplicate entity and attribute IDs;
- require the identity attribute to exist and remain a string;
- verify each returned attribute used by a table or editor has the declared
  `QueryValueType`;
- verify edit controls are compatible with their attribute value type;
- report the entity and attribute names in errors;
- return response-local `QueryColumnHandle`s rather than persisting indexes.

Provide focused derivation functions instead of a large stateful entity class:

```ts
bindEntity(result, description): BoundEntity
createEntityTableColumns(boundEntity, fields?): DataTableColumn[]
createEntityEditorDefinition(description): MasterDetailDefinition
```

`fields` is an optional ordered list of presentation fields. When omitted, use
attributes marked `visibleByDefault`. When present, resolve labels and widths
from the entity description, then apply explicit presentation overrides.
Allow the caller to replace or augment generated `DataTableColumn` entries for
custom cells such as ticket status.

Initially keep `MasterDetailDefinition` as an internal adapter consumed by the
existing master-detail components. Centralize its construction in the entity
module and remove direct ticket/user literals. Once all callers use entity
descriptions, assess whether the adapter type still earns its existence; do not
rewrite the master-detail stack and entity model simultaneously without need.

## How should tickets and users be described?

Create explicit descriptions for both current entities.

The ticket description includes `id`, `key`, `title`, `description`, and
`status`. It marks `id` as the identity, exposes the current default table
metadata, and makes `title` and `description` editable with their existing text
and textarea controls. Preserve required title validation. `id`, `key`, and
`status` remain non-editable until a real workflow requires otherwise.

The user description includes `id`, `username`, and `name`. It marks `id` as
the hidden identity, exposes `username` and `name` as default table columns, and
makes both fields editable and required. Move the Unicode-aware user-name regex
validation from `Users.tsx` into the `name` attribute description.

Replace the standalone `ticketFields` record with ticket entity lookups in
workspace query and presentation validation. Saved presentations continue to
store attribute IDs and layout configuration; make `PresentationField.label`
optional so the canonical entity label is used unless a view intentionally
overrides it (for example, displaying `title` as `Issue`). Do not migrate or
version the current seed document merely to remove labels that are intentional
overrides.

## How should existing views be wired?

For Users:

- import the user entity description;
- bind it to the loaded query result;
- generate the compact table columns from default-visible attributes;
- use its identity handle for row keys and navigation;
- derive the detail editor definition from the same description;
- remove the local table-column and editor literals.

For saved ticket views:

- bind the ticket description to the loaded query result;
- validate query filters, sorting, and presentation fields against its
  attributes;
- generate ordered table columns from the selected presentation;
- retain the status cell renderer as a narrow override on the generated status
  column;
- derive list-view handles and labels through the bound entity while retaining
  the existing custom list layout;
- derive the detail editor from the ticket description;
- remove the local `ticketEditor` and duplicated ticket field metadata.

Keep querying and mutation wire formats unchanged. Entity descriptions map the
existing table and attribute names; they do not introduce an entity endpoint,
registry, cache, or backend schema discovery.

## Implementation Checklist

- [x] Add typed entity and attribute description interfaces plus `defineEntity`
      under `ui/src/entities`, with concise TSDoc for the public authoring API.
- [x] Add runtime entity validation and query-result binding with actionable
      errors for duplicate attributes, missing identities, missing columns,
      type mismatches, and incompatible edit controls.
- [x] Add derivation helpers for default and presentation-selected
      `DataTableColumn`s, label/width overrides, identity handles, and the
      existing master-detail editor adapter.
- [x] Add typed form-validation adapters that parse control text into entity
      values, report parse failures on the correct attribute, and invoke
      `ValidationFunction<T>` only with its declared domain type.
- [x] Define ticket and user descriptions containing all current attributes,
      labels, types, table defaults, edit controls, required rules, and existing
      user-name validation.
- [x] Make workspace presentation labels optional, resolve canonical labels
      through the ticket description, and replace `ticketFields` with entity
      attribute lookup and validation.
- [x] Migrate the Users table, row identity, and detail form to the bound user
      description; remove its local editor and column literals.
- [x] Migrate saved ticket tables, list bindings, and detail forms to the bound
      ticket description while preserving presentation ordering, width and
      label overrides, status styling, filtering, search, and navigation.
- [x] Remove obsolete duplicated definition code only after both entities use
      the shared path; keep the master-detail adapter if it still isolates the
      existing component contract cleanly.
- [x] Add unit tests for description validation, binding, default columns,
      presentation overrides, editor derivation, required validation,
      cross-field validation forwarding, and custom cell overrides.
- [x] Update Users, saved-view, workspace, and application tests to prove tables
      and editors retain their current labels, fields, validation messages,
      hidden IDs, save behavior, and URL navigation.
- [x] Document entity-description ownership, authoring, and the distinction
      from backend storage descriptions in `ui/README.md`.

## What assumptions does the plan make?

- Entity descriptions are trusted TypeScript modules bundled with the UI, not
  persisted user data or backend-provided schemas.
- Attribute IDs and table names remain the stable contract shared with the
  generic query and mutate commands.
- Every query used for editing continues to request `"*"`, so editable and
  identity attributes are available even when hidden from a table.
- Saved presentations are view configuration, not entity schemas. They may
  select, order, resize, and relabel known attributes but may not define new
  attributes or validation rules.
- String and integer remain the only query value types and edit controls retain
  their current compatibility rules.
- Entity descriptions are imported explicitly by their owning features. A
  global or plugin-driven entity registry is unnecessary until descriptions
  must be discovered across independently loaded plugins.

## Risks and Open Questions

- The form currently stores strings while entity validators operate on domain
  values. Keep parsing in the editor adapter and test it directly; duplicating
  parsing in individual validators would produce inconsistent errors and make
  integer validation unsafe.
- Required metadata currently belongs to editor configuration. Keeping it
  inside `edit` avoids implying that every backend mutation path enforces the
  rule, but it means this is UI validation rather than a universal business
  invariant.
- Custom table cells cannot be fully data-driven without embedding rendering
  code or creating a renderer registry. Retaining explicit view-level overrides
  is simpler and keeps CSS ownership local.
- Ticket list presentation is structurally different from `DataTable`. The
  description should resolve its attributes and labels, but should not force
  the list into a generic table abstraction.
- Backend and UI descriptions can drift. Runtime query binding will detect many
  mismatches, but compile-time synchronization would require generated schemas
  or a serializable shared API contract and is intentionally deferred.
- Decide during implementation whether `EntityDescription.id` and `tableName`
  should be distinct for current entities. Keep both initially so UI identity
  is not accidentally coupled to physical storage naming.

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

Manually verify that active, closed, and all-issue views preserve their table
or list layouts, column order, labels, widths, status styling, search, and row
navigation. Open and edit tickets and users, confirm required and user-name
validation still appears after blur, successful saves update the table without
flicker, internal IDs remain hidden, and direct record URLs still restore the
correct detail pane.

Implementation completed on 2026-08-30. The master-detail definition remains a
narrow internal adapter generated by entity descriptions; ticket and user
features no longer author it directly. Entity-level validation builds full
typed values from edited form text and non-editable query-row values. Automated
verification passes with 96 tests across 25 files, TypeScript checking, and the
Vite production build. All seven repository-wide `nao check` tasks pass and
active development tasks were restarted with `nao --restart`.
