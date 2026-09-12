import { describe, expect, it } from "vitest";

import { matchesFilter } from "./filter-evaluation";
import { createCompositeFilter, createFilterCriterion, filterAttributeId, filterNodeId } from "./filter-model";
import { containsFilterOperator, equalsFilterOperator, inRangeFilterOperator } from "./filter-operators";

const title = (id: string, value: string) =>
  createFilterCriterion(filterAttributeId("title"), equalsFilterOperator, { type: "value", value }, filterNodeId(id));

describe("matchesFilter", () => {
  it("evaluates all, one, and none composites", () => {
    const values = { title: "Fix filters", estimate: 3 } as const;
    const value = (attribute: string) => values[attribute as keyof typeof values];
    expect(matchesFilter(createCompositeFilter("all", [title("a", "Fix filters")]), value)).toBe(true);
    expect(matchesFilter(createCompositeFilter("one", [title("a", "Other"), title("b", "Fix filters")]), value)).toBe(
      true,
    );
    expect(matchesFilter(createCompositeFilter("none", [title("a", "Other")]), value)).toBe(true);
  });

  it("ignores disabled nodes and handles typed operands", () => {
    const disabled = { ...title("disabled", "wrong"), disabled: true };
    const range = createFilterCriterion(filterAttributeId("estimate"), inRangeFilterOperator, {
      type: "range",
      minimum: 2,
      maximum: 4,
    });
    const contains = createFilterCriterion(filterAttributeId("title"), containsFilterOperator, {
      type: "value",
      value: "FILTER",
    });
    const filter = createCompositeFilter("all", [disabled, range, contains]);
    const values: Record<string, string | number> = { title: "Fix filters", estimate: 3 };
    expect(matchesFilter(filter, (attribute) => values[attribute])).toBe(true);
  });
});
