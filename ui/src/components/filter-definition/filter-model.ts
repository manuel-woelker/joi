declare const filterNodeIdBrand: unique symbol;
declare const filterAttributeIdBrand: unique symbol;
declare const filterOperatorIdBrand: unique symbol;

/** Stable identity of a node in a filter definition. */
export type FilterNodeId = string & { readonly [filterNodeIdBrand]: true };

/** Stable identity of an attribute exposed to the filter editor. */
export type FilterAttributeId = string & { readonly [filterAttributeIdBrand]: true };

/** Stable identity of a comparison operator. */
export type FilterOperatorId = string & { readonly [filterOperatorIdBrand]: true };

export type FilterValue = string | number;
export type FilterValueType = "string" | "int";
export type CompositeFilterKind = "all" | "one" | "none";

export interface ValueFilterOperand {
  readonly type: "value";
  readonly value: FilterValue;
}

export interface RangeFilterOperand {
  readonly type: "range";
  readonly minimum?: FilterValue;
  readonly maximum?: FilterValue;
}

export interface SetFilterOperand {
  readonly type: "set";
  readonly values: readonly FilterValue[];
}

export type FilterOperand = ValueFilterOperand | RangeFilterOperand | SetFilterOperand;

export interface CompositeFilterDefinition {
  readonly id: FilterNodeId;
  readonly type: "composite";
  readonly kind: CompositeFilterKind;
  readonly disabled?: boolean;
  readonly children: readonly FilterDefinition[];
}

export interface FilterCriterionDefinition {
  readonly id: FilterNodeId;
  readonly type: "criterion";
  readonly disabled?: boolean;
  readonly attribute: FilterAttributeId;
  readonly operator: FilterOperatorId;
  readonly operand?: FilterOperand;
}

/** Serializable recursive filter definition edited by FilterDefinitionEditor. */
export type FilterDefinition = CompositeFilterDefinition | FilterCriterionDefinition;

export function filterNodeId(value: string): FilterNodeId {
  if (!value.trim()) throw new Error("Filter node IDs must not be empty");
  return value as FilterNodeId;
}

export function filterAttributeId(value: string): FilterAttributeId {
  if (!value.trim()) throw new Error("Filter attribute IDs must not be empty");
  return value as FilterAttributeId;
}

export function filterOperatorId(value: string): FilterOperatorId {
  if (!value.trim()) throw new Error("Filter operator IDs must not be empty");
  return value as FilterOperatorId;
}

export function createFilterNodeId(): FilterNodeId {
  return filterNodeId(crypto.randomUUID());
}

export function createCompositeFilter(
  kind: CompositeFilterKind = "all",
  children: readonly FilterDefinition[] = [],
  id = createFilterNodeId(),
): CompositeFilterDefinition {
  return { id, type: "composite", kind, children };
}

export function createFilterCriterion(
  attribute: FilterAttributeId,
  operator: FilterOperatorId,
  operand?: FilterOperand,
  id = createFilterNodeId(),
): FilterCriterionDefinition {
  return { id, type: "criterion", attribute, operator, operand };
}
