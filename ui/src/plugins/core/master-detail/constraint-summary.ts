import type { FilterDefinition, FilterOperand } from "../../../components/filter-definition/filter-model";
import { defaultFilterOperators } from "../../../components/filter-definition/filter-operators";
import type { EntityDescription } from "../entities/entity-description";
import type { FacetSelection } from "../saved-views/entity-query";

export interface FilterSummaryLine {
  readonly text: string;
  readonly depth: number;
}

/** Describes enabled filter nodes without losing nested all/one/none semantics. */
export function summarizeFilter(filter: FilterDefinition, entity: EntityDescription): readonly FilterSummaryLine[] {
  const attributes = new Map(entity.attributes.map((attribute) => [attribute.id, attribute.label]));
  const operators = new Map(defaultFilterOperators.map((operator) => [operator.id, operator.label]));
  const lines: FilterSummaryLine[] = [];
  const visit = (node: FilterDefinition, depth: number) => {
    if (node.disabled) return;
    if (node.type === "criterion") {
      const attribute = attributes.get(node.attribute) ?? node.attribute;
      const operator = operators.get(node.operator) ?? node.operator;
      const operand = describeOperand(node.operand);
      lines.push({ text: `${attribute} ${operator}${operand ? ` ${operand}` : ""}`, depth });
      return;
    }
    const enabled = node.children.filter((child) => !child.disabled);
    if (!enabled.length) return;
    if (enabled.length > 1 || node.kind === "none") {
      lines.push({ text: { all: "All of", one: "One of", none: "None of" }[node.kind], depth });
      enabled.forEach((child) => visit(child, depth + 1));
    } else {
      visit(enabled[0], depth);
    }
  };
  visit(filter, 0);
  return lines;
}

function describeOperand(operand: FilterOperand | undefined): string {
  if (!operand) return "";
  if (operand.type === "value") return JSON.stringify(String(operand.value));
  if (operand.type === "set") return operand.values.map((value) => JSON.stringify(String(value))).join(", ");
  return `${operand.minimum === undefined ? "..." : JSON.stringify(String(operand.minimum))} to ${operand.maximum === undefined ? "..." : JSON.stringify(String(operand.maximum))}`;
}

/** Keeps lookup IDs as values so the view can resolve their display names. */
export function summarizeFacets(selections: readonly FacetSelection[], entity: EntityDescription) {
  const attributes = new Map(entity.attributes.map((attribute) => [attribute.id, attribute]));
  return selections.map((selection) => ({
    attribute: attributes.get(selection.attribute)?.label ?? selection.attribute,
    lookup: attributes.get(selection.attribute)?.lookup,
    value: selection.value,
    state: selection.state,
  }));
}
