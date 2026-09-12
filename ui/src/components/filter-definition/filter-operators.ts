import {
  filterOperatorId,
  type FilterAttributeId,
  type FilterOperatorId,
  type FilterValue,
  type FilterValueType,
  type FilterDefinition,
} from "./filter-model";

export interface FilterChoice {
  readonly value: FilterValue;
  readonly label: string;
  readonly description?: string;
}

export interface FilterableAttribute {
  readonly id: import("./filter-model").FilterAttributeId;
  readonly label: string;
  readonly description?: string;
  readonly valueType: FilterValueType;
  readonly operators?: readonly FilterOperatorId[];
  readonly values?: readonly FilterChoice[];
  readonly loadValues?: (
    query: string,
    selectedValue?: string,
  ) => Promise<{
    readonly entries: readonly FilterChoice[];
    readonly total: number;
  }>;
}

export type FilterOperandShape = "none" | "value" | "range" | "set";

export interface FilterOperatorDefinition {
  readonly id: FilterOperatorId;
  readonly label: string;
  readonly compatibleTypes: readonly FilterValueType[];
  readonly operand: FilterOperandShape;
}

export const equalsFilterOperator = filterOperatorId("equals");
export const notEqualsFilterOperator = filterOperatorId("not-equals");
export const lessThanFilterOperator = filterOperatorId("less-than");
export const setFilterOperator = filterOperatorId("set");
export const unsetFilterOperator = filterOperatorId("unset");
export const inRangeFilterOperator = filterOperatorId("in-range");
export const inSetFilterOperator = filterOperatorId("in-set");
export const containsFilterOperator = filterOperatorId("contains");

const allTypes: readonly FilterValueType[] = ["string", "int"];

export const defaultFilterOperators: readonly FilterOperatorDefinition[] = [
  { id: equalsFilterOperator, label: "=", compatibleTypes: allTypes, operand: "value" },
  { id: notEqualsFilterOperator, label: "!=", compatibleTypes: allTypes, operand: "value" },
  { id: lessThanFilterOperator, label: "<", compatibleTypes: allTypes, operand: "value" },
  { id: setFilterOperator, label: "is set", compatibleTypes: allTypes, operand: "none" },
  { id: unsetFilterOperator, label: "is unset", compatibleTypes: allTypes, operand: "none" },
  { id: inRangeFilterOperator, label: "is in range", compatibleTypes: allTypes, operand: "range" },
  { id: inSetFilterOperator, label: "is one of", compatibleTypes: allTypes, operand: "set" },
  { id: containsFilterOperator, label: "contains", compatibleTypes: ["string"], operand: "value" },
];

export function operatorsForAttribute(
  attribute: FilterableAttribute,
  operators: readonly FilterOperatorDefinition[] = defaultFilterOperators,
): readonly FilterOperatorDefinition[] {
  const allowed = attribute.operators && new Set(attribute.operators);
  return operators.filter(
    (operator) => operator.compatibleTypes.includes(attribute.valueType) && (!allowed || allowed.has(operator.id)),
  );
}

export function validateFilterSchema(
  attributes: readonly FilterableAttribute[],
  operators: readonly FilterOperatorDefinition[] = defaultFilterOperators,
): void {
  const attributeIds = new Set<FilterAttributeId>();
  for (const attribute of attributes) {
    if (attributeIds.has(attribute.id)) throw new Error(`Duplicate filter attribute '${attribute.id}'`);
    attributeIds.add(attribute.id);
    if (!attribute.label.trim()) throw new Error(`Filter attribute '${attribute.id}' requires a label`);
    if (!operatorsForAttribute(attribute, operators).length) {
      throw new Error(`Filter attribute '${attribute.id}' has no compatible operators`);
    }
  }
  const operatorIds = new Set<FilterOperatorId>();
  for (const operator of operators) {
    if (operatorIds.has(operator.id)) throw new Error(`Duplicate filter operator '${operator.id}'`);
    operatorIds.add(operator.id);
  }
}

/** Validates a filter against the available attributes, operators, and operand shapes. */
export function validateFilterAgainstSchema(
  root: FilterDefinition,
  attributes: readonly FilterableAttribute[],
  operators: readonly FilterOperatorDefinition[] = defaultFilterOperators,
): readonly string[] {
  const errors: string[] = [];
  const byAttribute = new Map(attributes.map((attribute) => [attribute.id, attribute]));
  const byOperator = new Map(operators.map((operator) => [operator.id, operator]));
  const visit = (node: FilterDefinition) => {
    if (node.type === "composite") {
      node.children.forEach(visit);
      return;
    }
    const attribute = byAttribute.get(node.attribute);
    const operator = byOperator.get(node.operator);
    if (!attribute) errors.push(`Criterion references unknown attribute '${node.attribute}'.`);
    if (!operator) errors.push(`Criterion references unknown operator '${node.operator}'.`);
    if (!attribute || !operator) return;
    if (!operatorsForAttribute(attribute, operators).some((candidate) => candidate.id === operator.id)) {
      errors.push(`Operator '${operator.label}' cannot be used with ${attribute.label}.`);
    }
    if (operator.operand === "none" && node.operand) errors.push(`Operator '${operator.label}' does not take a value.`);
    if (operator.operand !== "none" && node.operand?.type !== operator.operand) {
      errors.push(`Operator '${operator.label}' requires a ${operator.operand} value.`);
    }
    if (node.operand?.type === "set" && !node.operand.values.length)
      errors.push("A set must contain at least one value.");
    if (node.operand?.type === "range") {
      if (node.operand.minimum === undefined && node.operand.maximum === undefined) {
        errors.push("A range requires at least one bound.");
      } else if (
        node.operand.minimum !== undefined &&
        node.operand.maximum !== undefined &&
        node.operand.minimum > node.operand.maximum
      )
        errors.push("A range minimum must not exceed its maximum.");
    }
  };
  visit(root);
  return errors;
}
