# Filter Definition Component Plan

## What are we building?

Add a reusable SolidJS component for constructing nested filter definitions.
The component receives the available filterable attributes and edits one
serializable filter tree. A node is either a composite filter or an attribute
criterion:

```ts
type CompositeFilterKind = "all" | "one" | "none";

type FilterDefinition = CompositeFilterDefinition | FilterCriterionDefinition;

interface CompositeFilterDefinition {
  readonly id: FilterNodeId;
  readonly type: "composite";
  readonly kind: CompositeFilterKind;
  readonly disabled?: boolean;
  readonly children: readonly FilterDefinition[];
}

interface FilterCriterionDefinition {
  readonly id: FilterNodeId;
  readonly type: "criterion";
  readonly disabled?: boolean;
  readonly attribute: FilterAttributeId;
  readonly operator: FilterOperatorId;
  readonly operand?: FilterOperand;
}
```

`FilterNodeId`, `FilterAttributeId`, and `FilterOperatorId` are branded string
types. IDs provide stable identity for rendering and drag operations while the
nested representation remains straightforward to serialize in saved views.
The component is controlled: it accepts `value` and `onChange` in addition to
the attribute descriptions. It must not own persistence or query execution.

Use these user-facing labels for composites:

- `all`: **All of the following must be true**
- `one`: **One of the following must be true**
- `none`: **None of the following must be true**

## How should attributes and operators be described?

Introduce a component-local, domain-neutral filter schema rather than coupling
the component directly to ticket entities:

```ts
interface FilterableAttribute {
  readonly id: FilterAttributeId;
  readonly label: string;
  readonly valueType: FilterValueType;
  readonly operators?: readonly FilterOperatorId[];
  readonly values?: readonly FilterChoice[];
}

interface FilterOperatorDefinition {
  readonly id: FilterOperatorId;
  readonly label: string;
  readonly compatibleTypes: readonly FilterValueType[];
  readonly operand: "none" | "value" | "range" | "set";
}
```

Ship a default operator catalog covering equality and ordering, `set`, `unset`,
inclusive range membership, set membership, and string containment. Attribute
descriptions may restrict that catalog. Operand editors are selected from the
operator's operand shape and the attribute's value type; operators such as
`set` and `unset` render no operand. Keep operands structured (`value`, range
bounds, or value arrays) instead of overloading one scalar-or-array property.

Add a small adapter from `EntityDescription.attributes` to
`FilterableAttribute[]`. Lookups and finite value lists should become choice
inputs when available, while plain strings and integers use their appropriate
controls. Asynchronous lookup support can use the existing Select component,
but the filter component API should not depend on entity or lookup services.

Validate duplicate attribute IDs, unsupported operator/type combinations,
missing required operands, malformed ranges, duplicate node IDs, and empty
composite groups. Keep invalid intermediate input visible in the editor and
report it through validation state; do not silently rewrite user input.

## How should editing work?

Render each composite as an expandable branch and each criterion as a compact
row. A composite header contains its full semantic label, an enabled toggle,
an add menu, and compact duplicate/delete commands where applicable. A
criterion row contains an enabled toggle, attribute selector, operator
selector, and only the operand controls required by that operator.

Changing an attribute retains the current operator and operand only when they
remain compatible. Otherwise select the first compatible operator and create
an empty operand of the required shape. Changing operators follows the same
rule. Deleting the root is not allowed; callers may provide either a criterion
or composite root, and an explicit replace command can change its node type.

Disabled nodes remain visible and editable but are visually muted and excluded
from evaluation. Disabling a composite disables its complete subtree without
discarding descendant state. Use checkboxes or switches with explicit
accessible labels rather than making opacity the only indication.

Use semantic CSS variables for a restrained accent on composite headers:

- `none`: orange
- `one`: green
- `all`: purple

Color must be accompanied by the composite label and must meet contrast
requirements in every state. Derive shades from the existing application color
variables and avoid flooding entire nested panels with saturated backgrounds.

## How should nesting and drag and drop work?

Add pure filter-tree operations for finding, inserting, moving, duplicating,
and removing nodes. Each operation returns a new root definition. Reject moving
a node into itself or its descendants, preserve sibling order, and treat a move
to its current effective position as a no-op.

Adapt the recursive filter document to the existing normalized `TreeModel` for
rendering and pointer drag behavior. Composite filters map to folder nodes and
criteria map to a dedicated criterion kind. Keep the adapter and mutation
operations in the filter component module so the generic Tree API does not
learn filter semantics.

Allow drops before or after every node and inside composite nodes. Show the
prospective row position while dragging and preserve the current Tree keyboard
navigation. Composite nodes remain permanently expanded. A normal drag moves a
node; holding Control or Alt while dragging copies it with fresh IDs. Keep move
and copy buttons out of the compact criterion rows.

## How does this relate to saved queries?

Replace the current flat `FilterDefinition[]` only after introducing explicit
conversion and persistence handling. Bump the workspace document version and
migrate each old filter list to one enabled `all` composite containing the old
criteria with generated stable IDs. Preserve existing filter behavior exactly.

Update client-side query evaluation to recurse through composite nodes and skip
disabled nodes. Keep operator evaluation in a separate pure module shared by
the editor's validation tests and saved-view execution tests. Empty `all` and
`none` composites match everything; an empty `one` composite is invalid.

The backend query contract currently supports fewer operations than this
editor. The implemented translation boundary sends a criterion to the server
only when it can represent it exactly; otherwise it requests unfiltered rows
and applies the recursive filter client-side. Expanding the backend query
language remains follow-up work for large result sets.

Replace the ticket-specific status filter controls in `ViewEditor` with the
generic component once migration, evaluation, and entity-attribute adaptation
are complete. Other consumers can use the component without importing saved
view infrastructure.

## Implementation Checklist

- [x] Add branded IDs, recursive composite/criterion definitions, structured
      operand types, constructors, cloning, and structural validation.
- [x] Add filterable attribute and operator definitions, the default operator
      catalog, compatibility checks, and the entity-description adapter.
- [x] Implement immutable add, remove, duplicate, replace, enable/disable, and
      move operations with descendant and no-op protection.
- [x] Create the controlled `FilterDefinition` editor component with composite
      and criterion renderers, accessible controls, and inline validation.
- [x] Reuse the existing Select for finite and asynchronous choices and add
      operand editors for none, scalar, inclusive range, and set shapes.
- [x] Adapt filter definitions to `TreeModel`, wire move and modifier-copy drag
      operations, and keep composite branches permanently expanded.
- [x] Add compact CSS-module styling and semantic orange, green, and purple
      composite variables derived from the application palette.
- [x] Add playground scenarios for an empty filter, every operator shape,
      nested all/one/none groups, disabled nodes, validation failures, async
      choices, and drag/reorder behavior.
- [x] Migrate saved-view filters from the flat model to an `all` root while
      preserving existing workspace data and ticket defaults.
- [x] Add recursive client-side evaluation and an explicit server-query
      translation/capability boundary for unsupported operations.
- [x] Replace ticket-specific filter editing with the generic component.
- [x] Add focused model, move, validation, rendering, keyboard, drag/drop,
      migration, and recursive evaluation tests.
- [x] Run focused UI tests and type checking, then run `nao check` and restart
      active development tasks with `nao --restart`.

## How will we verify it?

- Every supplied attribute exposes only compatible operators and the correct
  operand editor; `set` and `unset` require no operand.
- Users can construct arbitrarily nested all/one/none groups, disable any node,
  and restore it without losing its values or descendants.
- Pointer operations can move, copy, reorder, and reparent nodes while cycles,
  root deletion, invalid targets, and accidental no-op moves are rejected.
- Composite meaning is communicated by text and accessible state as well as by
  orange, green, or purple accents.
- Existing saved ticket views migrate without changing their results, and
  unsupported server-side operations produce a clear error rather than an
  incorrect query.
- The component remains usable in narrow layouts, long labels do not overlap
  controls, popovers escape cropped parents, and focus remains stable after
  immutable updates.

## Assumptions and Risks

- `disabled` means retained and editable but ignored by evaluation. This is
  preferable to disabling the controls themselves because users must be able
  to re-enable or adjust a criterion.
- `in range` is inclusive at both ends. If open-ended or exclusive ranges are
  needed, they should be modeled explicitly rather than inferred from missing
  values.
- Stable node IDs become persisted workspace data. ID generation must happen at
  creation/migration boundaries, never during rendering.
- Reusing `Tree` is appropriate only if the filter adapter can preserve compact
  form-control interaction and accessibility. If folder-specific assumptions
  leak into the UI, generalize Tree's branch predicate narrowly instead of
  duplicating its drag algorithm.
- The broad operator catalog is ahead of the current backend. Unsupported
  server predicates are evaluated client-side after a `match_any` request. This
  is correct for the current small data sets, but server-side composition is
  required before filtered tables can exceed the query result limit.
