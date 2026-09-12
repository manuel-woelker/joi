import { describe, expect, it } from "vitest";

import { createCompositeFilter, createFilterCriterion, filterAttributeId, filterNodeId } from "./filter-model";
import { equalsFilterOperator } from "./filter-operators";
import {
  copyFilter,
  findFilter,
  indentFilter,
  moveFilter,
  moveFilterDown,
  outdentFilter,
  validateFilterDefinition,
} from "./filter-operations";

const criterion = (id: string) =>
  createFilterCriterion(
    filterAttributeId("title"),
    equalsFilterOperator,
    { type: "value", value: id },
    filterNodeId(id),
  );

describe("filter tree operations", () => {
  it("moves filters between composites while preserving order", () => {
    const nested = createCompositeFilter("one", [criterion("b")], filterNodeId("nested"));
    const root = createCompositeFilter("all", [criterion("a"), nested, criterion("c")], filterNodeId("root"));
    const moved = moveFilter(root, filterNodeId("c"), { parentId: nested.id, index: 0 });
    expect(moved.type === "composite" && moved.children.map((child) => child.id)).toEqual(["a", "nested"]);
    expect((findFilter(moved, nested.id) as typeof nested).children.map((child) => child.id)).toEqual(["c", "b"]);
  });

  it("rejects cycles and root moves", () => {
    const nested = createCompositeFilter("one", [criterion("child")], filterNodeId("nested"));
    const root = createCompositeFilter("all", [nested], filterNodeId("root"));
    expect(() => moveFilter(root, nested.id, { parentId: filterNodeId("child"), index: 0 })).toThrow();
    expect(() => moveFilter(root, root.id, { parentId: nested.id, index: 0 })).toThrow("root");
  });

  it("supports keyboard-equivalent sibling and nesting moves", () => {
    const nested = createCompositeFilter("one", [], filterNodeId("nested"));
    const root = createCompositeFilter("all", [nested, criterion("a"), criterion("b")], filterNodeId("root"));
    const reordered = moveFilterDown(root, filterNodeId("a"));
    expect(reordered.type === "composite" && reordered.children.map((child) => child.id)).toEqual(["nested", "b", "a"]);
    const indented = indentFilter(root, filterNodeId("a"));
    expect((findFilter(indented, nested.id) as typeof nested).children[0].id).toBe("a");
    expect(outdentFilter(indented, filterNodeId("a"))).toEqual(root);
  });

  it("copies a filter to a requested drop position with new IDs", () => {
    const root = createCompositeFilter("all", [criterion("a"), criterion("b")], filterNodeId("root"));
    const copied = copyFilter(root, filterNodeId("a"), { parentId: root.id, index: 2 });
    expect(
      copied.type === "composite" &&
        copied.children.map((child) => (child.type === "criterion" ? child.operand : null)),
    ).toEqual([
      { type: "value", value: "a" },
      { type: "value", value: "b" },
      { type: "value", value: "a" },
    ]);
    expect(copied.type === "composite" && copied.children[2].id).not.toBe("a");
  });

  it("reports duplicate IDs and empty groups", () => {
    const root = createCompositeFilter("all", [criterion("same"), criterion("same")], filterNodeId("root"));
    expect(validateFilterDefinition(root)).toHaveLength(1);
    expect(validateFilterDefinition(createCompositeFilter("all", [], filterNodeId("empty")))[0]).toContain("at least");
  });
});
