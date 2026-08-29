# Shared TanStack Table Component Plan

## What are we building?

Create a reusable SolidJS table component built on `@tanstack/solid-table`
that renders flexible query results rather than domain-specific row objects.
Use it for both the Users administration view and the table presentation of
saved ticket views.

The component should preserve the backend's generic, columnar `QueryResponse`
shape. It must not require a `User`, `Ticket`, or other fixed record interface.
Views should select and describe attributes while the shared query and table
layers handle typed values, rows, semantic markup, responsive overflow, and
common styling.

The initial version should not add sorting, pagination, column resizing,
selection, or virtualization.

## How should query data be modeled?

Introduce one shared UI model matching the query command's tagged columnar
response:

```ts
type QueryColumnValues =
  | { type: "string"; values: string[] }
  | { type: "int"; values: number[] };

interface QueryResultColumn {
  attribute: string;
  values: QueryColumnValues;
}

interface QueryResponse {
  number_of_hits: number;
  result_columns: QueryResultColumn[];
}

type QueryValue = string | number;
```

Keep wire names aligned with the backend at the transport boundary. Centralize
runtime validation in one query-response parser instead of duplicating partial
string-only validators for users and tickets. Reject duplicate attributes,
unknown value tags, invalid values, and inconsistent returned column lengths
with useful errors.

`number_of_hits` is the total number of matching records and may exceed the
number returned due to `max_results`. Derive the returned row count from the
column value arrays; do not treat `number_of_hits` as the rendered row count.

Wrap each validated response in a query-result model that assigns every column
a response-local index and exposes an opaque column handle:

```ts
declare const indexBrand: unique symbol;

type BrandedIndex<TKind extends string> = number & {
  readonly [indexBrand]: TKind;
};

type QueryColumnIndex = BrandedIndex<"query-column">;
type QueryRowIndex = BrandedIndex<"query-row">;

interface QueryColumnHandle {
  readonly index: QueryColumnIndex;
  readonly attribute: string;
  readonly type: QueryValueType;
}

interface QueryResult {
  readonly columns: readonly QueryColumnHandle[];
  readonly rows: readonly QueryResultRow[];
  column(attribute: string): QueryColumnHandle | undefined;
  requireColumn(attribute: string): QueryColumnHandle;
}

interface QueryResultRow {
  readonly index: QueryRowIndex;
  value(column: QueryColumnHandle): QueryValue | undefined;
}
```

All indexes owned by the query-result model must use distinct branded types;
plain `number` values are reserved for counts, limits, and numeric cell data.
Create branded indexes only through narrow validated constructors or internal
iteration helpers. Do not expose casts at component call sites. This prevents
row indexes, column indexes, counts, and arbitrary numbers from being mixed.

A handle belongs to one query result; using a handle with a row from another
result should fail clearly in development and tests. Value access then indexes
directly into
`result_columns[column.index].values.values[row.index]` without repeated name
lookup or row materialization.

Attribute names remain necessary at the transport and persisted-configuration
boundaries because response order can change. Resolve each configured
attribute name to a handle once when binding a presentation to a response.
Wildcard views can use the response's handles directly in response order with
no name lookup. A selected key handle can provide TanStack stable row IDs,
falling back to the result index when no key is configured.

## What should the table API look like?

Use query-oriented column definitions that hold resolved column handles:

```tsx
<DataTable
  ariaLabel="Users"
  result={result}
  columns={[
    { column: result.requireColumn("username"), header: "Username" },
    { column: result.requireColumn("name"), header: "Name" },
  ]}
  rowKey={result.requireColumn("username")}
  density="compact"
/>
```

The public column model should support a handle, header, optional width, and
optional cell renderer receiving the typed `QueryValue`, handle, and
`QueryResultRow`. Resolve required columns before rendering so missing
configured attributes produce a useful binding error instead of blank cells.
Internally, adapt these definitions to TanStack
`ColumnDef<QueryResultRow>[]`, then use `createSolidTable`, `getCoreRowModel`,
and Solid's `flexRender` helper.

Render native `table`, `thead`, `tbody`, `tr`, `th`, and `td` elements. Accept
an accessible label and `compact` or `comfortable` density. Keep loading,
errors, query execution, and domain-specific empty states outside the table.

## How will the existing views migrate?

Create one generic query client that sends the table name, criterion,
attributes, and result limit, then returns a validated `QueryResponse`.
`loadUsers` and `loadTickets` should become thin request builders or be removed
when they add no domain behavior.

The Users view should bind username and name to column handles once and pass
the query result directly to `DataTable`. It should not materialize `User[]`.

The saved ticket view should use the same response for both layouts. Its table
columns come from configured presentation fields and preserve labels, widths,
ordering, density, and the custom status badge renderer. Its list renderer
should resolve its required handles once and read values through
`QueryResultRow.value(handle)`; it may validate the few attributes that the
list layout requires, but must not force the shared query response into a
closed ticket schema.

Transient text filtering and client-side presentation sorting should resolve
configured attribute names once, then operate on generic rows through handles.
Backend query criteria remain responsible for persisted filters.

Move shared table styles from `ViewContent.module.css` and
`Users.module.css` into the table component's CSS module. Keep ticket status
badge styles with the ticket view.

## Implementation Checklist

- [x] Add a compatible `@tanstack/solid-table` dependency to `ui/package.json`
      and update the pnpm lockfile.
- [x] Add shared `QueryResponse`, tagged column-value, `QueryValue`, and
      `QueryResultRow` types plus a centralized runtime response parser.
- [x] Add tests for string and integer columns, malformed values, duplicate
      attributes, unequal column lengths, empty projections, and total hits
      exceeding returned rows.
- [x] Add a generic query client accepting table, criterion, attributes, and
      result limit, and remove the duplicated users/tickets response parsing.
- [x] Define shared branded-index infrastructure plus distinct
      `QueryColumnIndex` and `QueryRowIndex` types, with narrow constructors
      confined to the query-result implementation.
- [x] Implement a query-result wrapper with response-local branded indexes,
      column handles, one-time name-to-handle binding, lazy rows, direct indexed
      value access, and configurable stable row identity.
- [x] Add compile-time type assertions proving row indexes, column indexes,
      counts, and plain numbers are not interchangeable.
- [x] Add runtime tests that reject cross-result handles and verify configured
      names are resolved once rather than looked up for each rendered cell.
- [x] Add a query-oriented `DataTable` that adapts resolved column handles to
      TanStack, uses a reactive core row model, renders semantic markup, and
      supports labels, widths, custom cells, density, and overflow containment.
- [x] Add a focused CSS module using existing color variables for shared table
      headers, cells, hover states, borders, density, and responsive overflow.
- [x] Migrate Users to the generic query response and table without exposing
      its internal ID or materializing `User[]`.
- [x] Migrate the saved ticket table to generic result columns while preserving
      configured fields, status badges, widths, ordering, and density.
- [x] Adapt ticket list rendering, transient search, and presentation sorting
      to generic query rows and remove the table-only `Ticket` dependency where
      it is no longer needed.
- [x] Remove obsolete domain response validators, row conversion code, and
      duplicated table CSS.
- [x] Add component tests for asynchronously supplied responses, dynamic
      schemas, integer rendering, custom cells, accessible naming, density,
      and stable row keys.
- [x] Extend application tests to verify Users and ticket tables still render
      expected columns and records and do not retain stale schema after view
      navigation.
- [x] Update `ui/README.md` with the generic query-result model, TanStack Table
      role, and intentionally deferred features.

## What assumptions does the plan make?

- The backend's tagged `string` and `int` values are the initial supported
  types. New tags can extend the union without changing table consumers.
- Query results remain columnar because that is the backend contract and keeps
  schema information explicit. Rows and column handles are response-local
  adapters, not a second source of truth.
- Persisted queries and presentations continue to identify attributes by
  stable names. Numeric column indexes are valid only for the response that
  created them and must never be persisted.
- Every application-owned index uses a branded type. Counts such as
  `number_of_hits`, result limits, array lengths, and numeric field values stay
  unbranded because they are quantities rather than positions.
- TanStack Table is a headless rendering engine; Joi CSS and native table
  semantics remain responsible for appearance and accessibility.
- Domain-specific renderers interpret values when needed. The shared table
  does not know about tickets, users, statuses, workspace presentations, or
  fetch services.
- Current result limits are small enough to build lightweight row adapters
  without virtualization or pagination.

## Risks and Open Questions

- A response with zero projected columns cannot communicate its returned row
  count independently of total hits. The current UI requests attributes, so
  treat this as zero renderable rows unless the API later adds a separate
  returned-count field.
- Result columns should normally have equal lengths. Failing fast is safer than
  silently truncating mismatched data, but this tightens the current behavior
  and should be covered by an explicit parser test.
- TanStack expects row-oriented data. Keep the adapter lazy and narrow so the
  table dependency does not force the transport and application models to
  abandon their flexible columnar schema.
- Raw numeric indexes would be fast but brittle and easy to mix across query
  results. Keep branded indexes behind response-local handles, avoid leaking
  TanStack's unbranded internal indexes into application APIs, and perform name
  resolution only when binding configuration or interpreting transport data.
- Solid reactivity can be lost if response data or computed columns are read
  only once. Use getter-backed TanStack options and test asynchronous updates
  and schema changes.
- Sorting and column resizing are plausible next steps, but defining their
  state contracts now would overengineer this migration.

## Verification

Run:

```bash
cd ui
pnpm check
pnpm test -- --run
pnpm build

cd ..
nao check
nao --restart
```

Manually verify Active issues and Users at desktop and narrow widths. Confirm
string and integer values render, configured ticket widths and status badges
remain intact, hidden internal attributes stay hidden, compact density is
visibly denser, overflow remains inside the main area, total hits are distinct
from rendered rows, and switching views does not retain stale rows or columns.

Automated verification completed on 2026-08-29. Type checking, 44 tests across
13 files, and the Vite production build pass. Application tests cover switching
between Users and Active issues without retaining stale schemas, hiding the
internal user ID, dynamic result updates, custom cells, integer values, density,
accessibility, and stable row IDs. Responsive containment is implemented in the
shared CSS module; no browser automation was available for a separate visual
desktop/mobile pass.
