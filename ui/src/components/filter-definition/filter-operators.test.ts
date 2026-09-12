import { describe, expect, it } from "vitest";

import { createFilterCriterion, filterAttributeId, filterNodeId } from "./filter-model";
import {
  containsFilterOperator,
  defaultFilterOperators,
  inRangeFilterOperator,
  operatorsForAttribute,
  validateFilterAgainstSchema,
  validateFilterSchema,
} from "./filter-operators";

const title = { id: filterAttributeId("title"), label: "Title", valueType: "string" as const };
const estimate = { id: filterAttributeId("estimate"), label: "Estimate", valueType: "int" as const };

describe("filter schema", () => {
  it("offers only type-compatible operators", () => {
    expect(operatorsForAttribute(title).some((operator) => operator.id === containsFilterOperator)).toBe(true);
    expect(operatorsForAttribute(estimate).some((operator) => operator.id === containsFilterOperator)).toBe(false);
  });

  it("rejects duplicate attributes", () => {
    expect(() => validateFilterSchema([title, title], defaultFilterOperators)).toThrow("Duplicate");
  });

  it("validates operand shape and range ordering", () => {
    const filter = createFilterCriterion(
      estimate.id,
      inRangeFilterOperator,
      { type: "range", minimum: 9, maximum: 2 },
      filterNodeId("range"),
    );
    expect(validateFilterAgainstSchema(filter, [estimate])[0]).toContain("minimum");
  });
});
