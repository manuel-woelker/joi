// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@solidjs/testing-library";

import { FilterDefinitionEditor } from "./FilterDefinitionEditor";
import {
  createCompositeFilter,
  createFilterCriterion,
  filterAttributeId,
  filterNodeId,
  type FilterDefinition,
} from "./filter-model";
import { inSetFilterOperator } from "./filter-operators";

const attributes = [
  {
    id: filterAttributeId("status"),
    label: "Status",
    valueType: "string" as const,
    values: [
      { value: "open", label: "Open" },
      { value: "closed", label: "Closed" },
    ],
  },
];

afterEach(cleanup);

function TestEditor() {
  const initial = createCompositeFilter(
    "all",
    [
      createFilterCriterion(
        filterAttributeId("status"),
        inSetFilterOperator,
        { type: "set", values: ["open"] },
        filterNodeId("status"),
      ),
    ],
    filterNodeId("root"),
  );
  const [value, setValue] = createSignal<FilterDefinition>(initial);
  return <FilterDefinitionEditor attributes={attributes} value={value()} onChange={setValue} />;
}

describe("FilterDefinitionEditor", () => {
  it("renders semantic groups and edits finite set operands", () => {
    render(() => <TestEditor />);
    expect(screen.getByRole("option", { name: "All of the following must be true" })).toBeTruthy();
    const closed = screen.getByRole<HTMLInputElement>("checkbox", { name: "Closed" });
    fireEvent.click(closed);
    expect(closed.checked).toBe(true);
  });

  it("can disable a criterion without removing it", () => {
    render(() => <TestEditor />);
    const enabled = screen.getByRole<HTMLInputElement>("checkbox", { name: "Enable criterion" });
    fireEvent.click(enabled);
    expect(enabled.checked).toBe(false);
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "Open" }).checked).toBe(true);
  });

  it("keeps composites expanded and omits move and copy buttons", () => {
    render(() => <TestEditor />);
    expect(screen.queryByRole("button", { name: /folder/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /move filter/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /duplicate filter/i })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Filter attribute" })).toBeTruthy();
  });
});
