import { describe, expect, it } from "vitest";
import {
  addTableColumn,
  moveTableColumn,
  normalizeColumnConfig,
  removeTableColumn,
  visibleColumnOrder,
} from "./table-column-config";

describe("table column configuration", () => {
  const defaults = ["name", "age"];
  const catalog = ["id", "name", "age", "status"];
  it("restores old order/width configs with the default visible columns", () => {
    const result = normalizeColumnConfig({ order: ["age", "name"], widths: { name: 210 } }, catalog, defaults);
    expect(visibleColumnOrder(result)).toEqual(["age", "name"]);
    expect(result.widths).toEqual({ name: 210 });
  });
  it("drops unknowns, duplicates and invalid sizes, and recovers stale selections", () => {
    const result = normalizeColumnConfig(
      {
        order: ["gone", "age", "age"],
        visible: ["gone"],
        widths: { age: 12, name: Number.NaN, gone: 400, status: 96 },
      },
      catalog,
      defaults,
    );
    expect(result.order).toEqual(["age", "name", "id", "status"]);
    expect(result.visible).toEqual(defaults);
    expect(result.widths).toEqual({ status: 96 });
    expect(normalizeColumnConfig(undefined, ["id"], []).visible).toEqual(["id"]);
    expect(normalizeColumnConfig(undefined, [], []).visible).toEqual([]);
  });
  it("adds and re-adds first, preserves widths, and moves only visible columns", () => {
    const start = normalizeColumnConfig({ order: catalog, widths: { status: 180 } }, catalog, defaults);
    const added = addTableColumn(start, "status");
    expect(visibleColumnOrder(added)).toEqual(["status", "name", "age"]);
    const moved = moveTableColumn(added, "status", 2);
    expect(visibleColumnOrder(moved)).toEqual(["name", "age", "status"]);
    const removed = removeTableColumn(moved, "status");
    expect(visibleColumnOrder(removed)).toEqual(defaults);
    expect(visibleColumnOrder(addTableColumn(removed, "status"))).toEqual(visibleColumnOrder(added));
    expect(removed.widths.status).toBe(180);
    expect(addTableColumn(start, "unknown")).toBe(start);
    expect(start.visible).toEqual(defaults);
  });
  it("protects the last column and resets with defaults", () => {
    const start = normalizeColumnConfig({ order: ["age"], visible: ["age"], widths: { age: 500 } }, catalog, defaults);
    expect(removeTableColumn(start, "age")).toBe(start);
    const reset = normalizeColumnConfig(undefined, catalog, defaults);
    expect(visibleColumnOrder(reset)).toEqual(defaults);
    expect(reset.widths).toEqual({});
  });
});
