// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@solidjs/testing-library";

import { FilterDefinitionEditor } from "./FilterDefinitionEditor";
import {
  createCompositeFilter,
  createFilterCriterion,
  filterAttributeId,
  filterNodeId,
  type FilterDefinition,
} from "./filter-model";
import { equalsFilterOperator, inSetFilterOperator, notEqualsFilterOperator } from "./filter-operators";

const attributes = [
  {
    id: filterAttributeId("status"),
    label: "Status",
    description: "Current workflow state.",
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

  it("preserves input focus while editing an operand", () => {
    const textAttributes = [
      {
        id: filterAttributeId("title"),
        label: "Title",
        valueType: "string" as const,
      },
    ];
    const initial = createCompositeFilter("all", [
      createFilterCriterion(
        textAttributes[0].id,
        equalsFilterOperator,
        { type: "value", value: "" },
        filterNodeId("title"),
      ),
    ]);
    const TestTextEditor = () => {
      const [value, setValue] = createSignal<FilterDefinition>(initial);
      return <FilterDefinitionEditor attributes={textAttributes} value={value()} onChange={setValue} />;
    };
    render(() => <TestTextEditor />);
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Filter value" });
    input.focus();

    fireEvent.input(input, { target: { value: "a" } });
    fireEvent.input(input, { target: { value: "ab" } });

    expect(screen.getByRole("textbox", { name: "Filter value" })).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("ab");
  });

  it("preserves an operand when changing to an operator with the same operand shape", () => {
    const textAttributes = [
      {
        id: filterAttributeId("title"),
        label: "Title",
        valueType: "string" as const,
      },
    ];
    const initial = createCompositeFilter("all", [
      createFilterCriterion(
        textAttributes[0].id,
        equalsFilterOperator,
        { type: "value", value: "preserve me" },
        filterNodeId("title"),
      ),
    ]);
    const TestTextEditor = () => {
      const [value, setValue] = createSignal<FilterDefinition>(initial);
      return <FilterDefinitionEditor attributes={textAttributes} value={value()} onChange={setValue} />;
    };
    render(() => <TestTextEditor />);

    fireEvent.change(screen.getByRole("combobox", { name: "Comparison operator" }), {
      target: { value: notEqualsFilterOperator },
    });

    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Filter value" }).value).toBe("preserve me");
  });

  it("keeps composites expanded and omits move and copy buttons", () => {
    render(() => <TestEditor />);
    expect(screen.queryByRole("button", { name: /folder/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /move filter/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /duplicate filter/i })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Filter attribute" })).toBeTruthy();
  });

  it("shows attribute types and descriptions in the attribute picker", async () => {
    render(() => <TestEditor />);
    fireEvent.focus(screen.getByRole("combobox", { name: "Filter attribute" }));

    expect(await screen.findByText("Current workflow state.")).toBeTruthy();
    expect(screen.getByText("string")).toBeTruthy();
  });

  it("marks a one-of composite without enabled children as invalid", () => {
    const disabled = createFilterCriterion(
      filterAttributeId("status"),
      inSetFilterOperator,
      { type: "set", values: ["open"] },
      filterNodeId("disabled"),
    );
    const value = createCompositeFilter("one", [{ ...disabled, disabled: true }], filterNodeId("disabled-one"));
    render(() => <FilterDefinitionEditor attributes={attributes} value={value} onChange={() => undefined} />);

    expect(screen.getByText('A "One of" composite filter must contain at least one filter.')).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Composite filter kind" }).closest('[aria-invalid="true"]'),
    ).toBeTruthy();
  });

  it("reorders criteria when dragging their handles", () => {
    const first = createFilterCriterion(
      filterAttributeId("status"),
      inSetFilterOperator,
      { type: "set", values: ["open"] },
      filterNodeId("first"),
    );
    const second = createFilterCriterion(
      filterAttributeId("status"),
      inSetFilterOperator,
      { type: "set", values: ["closed"] },
      filterNodeId("second"),
    );
    const value = createCompositeFilter("all", [first, second], filterNodeId("root"));
    const onChange = vi.fn();
    render(() => <FilterDefinitionEditor attributes={attributes} value={value} onChange={onChange} />);

    const rows = screen.getAllByRole("treeitem");
    const firstHandle = rows[1].querySelector<HTMLElement>("[data-tree-drag-handle]")!;
    vi.spyOn(rows[2], "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 40,
      left: 0,
      top: 40,
      right: 600,
      bottom: 72,
      width: 600,
      height: 32,
      toJSON: () => undefined,
    });

    fireEvent.dragStart(firstHandle);
    fireEvent(rows[2], new MouseEvent("dragover", { bubbles: true, clientX: 100, clientY: 70 }));
    fireEvent(rows[2], new MouseEvent("drop", { bubbles: true, clientX: 100, clientY: 70 }));

    const reordered = onChange.mock.lastCall?.[0] as FilterDefinition;
    expect(reordered.type).toBe("composite");
    if (reordered.type === "composite")
      expect(reordered.children.map((child) => child.id)).toEqual([second.id, first.id]);
  });
});
