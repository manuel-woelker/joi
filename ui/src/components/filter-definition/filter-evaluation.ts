import type { FilterDefinition, FilterValue } from "./filter-model";
import {
  containsFilterOperator,
  equalsFilterOperator,
  inRangeFilterOperator,
  inSetFilterOperator,
  lessThanFilterOperator,
  notEqualsFilterOperator,
  setFilterOperator,
  unsetFilterOperator,
} from "./filter-operators";

/** Evaluates a recursive filter using an application-provided attribute accessor. */
export function matchesFilter(
  filter: FilterDefinition,
  value: (attribute: string) => FilterValue | undefined,
): boolean {
  if (filter.disabled) return true;
  if (filter.type === "composite") {
    const enabled = filter.children.filter((child) => !child.disabled);
    if (!enabled.length) return true;
    if (filter.kind === "all") return enabled.every((child) => matchesFilter(child, value));
    if (filter.kind === "one") return enabled.some((child) => matchesFilter(child, value));
    return enabled.every((child) => !matchesFilter(child, value));
  }

  const actual = value(filter.attribute);
  if (filter.operator === setFilterOperator) return actual !== undefined && actual !== "";
  if (filter.operator === unsetFilterOperator) return actual === undefined || actual === "";
  if (!filter.operand) return false;
  if (filter.operator === inRangeFilterOperator && filter.operand.type === "range") {
    return (
      actual !== undefined &&
      (filter.operand.minimum === undefined || compare(actual, filter.operand.minimum) >= 0) &&
      (filter.operand.maximum === undefined || compare(actual, filter.operand.maximum) <= 0)
    );
  }
  if (filter.operator === inSetFilterOperator && filter.operand.type === "set") {
    return actual !== undefined && filter.operand.values.some((candidate) => equal(actual, candidate));
  }
  if (filter.operand.type !== "value" || actual === undefined) return false;
  if (filter.operator === equalsFilterOperator) return equal(actual, filter.operand.value);
  if (filter.operator === notEqualsFilterOperator) return !equal(actual, filter.operand.value);
  if (filter.operator === lessThanFilterOperator) return compare(actual, filter.operand.value) < 0;
  if (filter.operator === containsFilterOperator) {
    return String(actual).toLocaleLowerCase().includes(String(filter.operand.value).toLocaleLowerCase());
  }
  return false;
}

function equal(left: FilterValue, right: FilterValue): boolean {
  return typeof left === "string" && typeof right === "string"
    ? left.toLocaleLowerCase() === right.toLocaleLowerCase()
    : left === right;
}

function compare(left: FilterValue, right: FilterValue): number {
  return typeof left === "number" && typeof right === "number"
    ? left - right
    : String(left).localeCompare(String(right));
}
