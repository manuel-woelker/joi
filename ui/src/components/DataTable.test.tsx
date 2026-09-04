import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseQueryResponse } from "../query/query-result";
import { DataTable, type DataTableColumn } from "./DataTable";

afterEach(cleanup);

const createResult = (name: string, age: number) =>
  parseQueryResponse({
    number_of_hits: 1,
    result_columns: [
      { attribute: "name", values: { type: "string", values: [name] } },
      { attribute: "age", values: { type: "int", values: [age] } },
    ],
  });

describe("DataTable", () => {
  it("renders typed values, custom cells, accessibility, density, and row keys", () => {
    const result = createResult("Jane", 34);
    const columns: DataTableColumn[] = [
      { column: result.requireColumn("name"), header: "Name" },
      {
        column: result.requireColumn("age"),
        header: "Age",
        cell: (value) => <strong>{value} years</strong>,
      },
    ];
    render(() => (
      <DataTable
        ariaLabel="People"
        result={result}
        columns={columns}
        rowKey={result.requireColumn("name")}
        density="compact"
      />
    ));

    expect(screen.getByRole("table", { name: "People" }).dataset.density).toBe("compact");
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeTruthy();
    expect(screen.getByText("Jane")).toBeTruthy();
    expect(screen.getByText("34 years").tagName).toBe("STRONG");
    expect(screen.getByText("Jane").closest("tr")?.dataset.rowId).toBe("Jane");
  });

  it("reacts to a new result and schema", () => {
    const first = createResult("Jane", 34);
    const second = createResult("Joe", 41);
    const [state, setState] = createSignal({
      result: first,
      columns: [{ column: first.requireColumn("name"), header: "Name" }] satisfies DataTableColumn[],
    });
    render(() => <DataTable ariaLabel="People" result={state().result} columns={state().columns} />);

    setState({
      result: second,
      columns: [{ column: second.requireColumn("age"), header: "Age" }],
    });
    expect(screen.getByRole("columnheader", { name: "Age" })).toBeTruthy();
    expect(screen.getByText("41")).toBeTruthy();
    expect(screen.queryByText("Jane")).toBeNull();
  });

  it("updates a cell in place when its query row changes", () => {
    const result = createResult("Jane", 34);
    render(() => (
      <DataTable
        ariaLabel="People"
        result={result}
        columns={[{ column: result.requireColumn("name"), header: "Name" }]}
      />
    ));
    const table = screen.getByRole("table", { name: "People" });

    result.updateRow(result.rows[0], [{ column: result.requireColumn("name"), value: "Grace" }]);

    expect(screen.getByText("Grace")).toBeTruthy();
    expect(screen.getByRole("table", { name: "People" })).toBe(table);
  });

  it("separates row selection from activation", () => {
    const result = createResult("Jane", 34);
    const select = vi.fn();
    const activate = vi.fn();
    render(() => (
      <DataTable
        ariaLabel="People"
        result={result}
        columns={[{ column: result.requireColumn("name"), header: "Name" }]}
        rowKey={result.requireColumn("name")}
        selectedRowKey="Jane"
        onRowSelect={select}
        onRowActivate={activate}
      />
    ));
    const row = screen.getByRole("row", { name: "Jane" });
    expect(row.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(row);
    expect(select).toHaveBeenCalledOnce();
    expect(activate).not.toHaveBeenCalled();
    fireEvent.dblClick(row);
    fireEvent.keyDown(row, { key: "Enter" });
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it("resizes and reorders columns", async () => {
    const result = createResult("Jane", 34);
    render(() => (
      <DataTable
        ariaLabel="People"
        result={result}
        columns={[
          { column: result.requireColumn("name"), header: "Name" },
          { column: result.requireColumn("age"), header: "Age" },
        ]}
      />
    ));

    const resizeName = screen.getByRole("separator", { name: "Resize Name column" });
    expect(resizeName.getAttribute("aria-valuemin")).toBe("32");
    expect(resizeName.getAttribute("aria-valuenow")).toBe("150");
    fireEvent.keyDown(resizeName, { key: "ArrowRight" });
    expect(resizeName.getAttribute("aria-valuenow")).toBe("158");
    for (let index = 0; index < 20; index += 1) fireEvent.keyDown(resizeName, { key: "ArrowLeft" });
    expect(resizeName.getAttribute("aria-valuenow")).toBe("32");
    const table = screen.getByRole("table", { name: "People" });
    expect(table.style.getPropertyValue("--data-table-columns")).toBe("32px minmax(150px, 1fr)");
    vi.spyOn(table, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 500,
      height: 100,
      top: 0,
      right: 500,
      bottom: 100,
      left: 0,
      toJSON: () => undefined,
    });
    expect(screen.getByRole("separator", { name: "Resize Age column" }).getAttribute("aria-valuenow")).toBe("150");

    fireEvent.pointerDown(resizeName, { button: 0, clientX: 150, pointerId: 1 });
    fireEvent.mouseDown(resizeName, { clientX: 150 });
    expect(document.documentElement.style.userSelect).toBe("none");
    fireEvent.pointerMove(document, { clientX: 180, pointerId: 1 });
    expect(screen.queryByTestId("column-drag-preview")).toBeNull();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Name", "Age"]);
    fireEvent.mouseUp(document, { clientX: 158 });

    const nameHeader = screen.getByRole("columnheader", { name: "Name" });
    fireEvent.pointerDown(nameHeader, { button: 0, clientX: 0, pointerId: 2 });
    fireEvent.pointerMove(nameHeader, { clientX: 100, pointerId: 2 });
    expect(document.documentElement.style.userSelect).toBe("none");
    expect(screen.getByTestId("column-drag-preview").textContent).toBe("Name");
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Name", "Age"]);
    fireEvent.pointerMove(document, { clientX: 300, pointerId: 2 });
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Age", "Name"]);
    expect(screen.getByRole("row", { name: "34 Jane" })).toBeTruthy();
    fireEvent.pointerUp(document, { clientX: 20, pointerId: 2 });
    await waitFor(() => expect(document.documentElement.style.userSelect).toBe(""));
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Age", "Name"]);
    expect(screen.getByRole("row", { name: "34 Jane" })).toBeTruthy();

    fireEvent.keyDown(screen.getByRole("columnheader", { name: "Name" }), { key: "ArrowLeft", altKey: true });
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Name", "Age"]);

    const cancellableHeader = screen.getByRole("columnheader", { name: "Name" });
    fireEvent.pointerDown(cancellableHeader, { button: 0, clientX: 0, pointerId: 3 });
    fireEvent.pointerMove(cancellableHeader, { clientX: 300, pointerId: 3 });
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Age", "Name"]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Name", "Age"]);
    await waitFor(() => expect(document.documentElement.style.userSelect).toBe(""));
  });

  it("forwards row context menu events without activating the row", () => {
    const result = createResult("Jane", 34);
    const contextMenu = vi.fn();
    const activate = vi.fn();
    render(() => (
      <DataTable
        ariaLabel="People"
        result={result}
        columns={[{ column: result.requireColumn("name"), header: "Name" }]}
        onRowActivate={activate}
        onRowContextMenu={contextMenu}
      />
    ));
    const row = screen.getByRole("row", { name: "Jane" });
    fireEvent.contextMenu(row, { clientX: 12, clientY: 24 });

    expect(contextMenu).toHaveBeenCalledWith(expect.objectContaining({ clientX: 12, clientY: 24 }), result.rows[0]);
    expect(activate).not.toHaveBeenCalled();
  });

  it("moves row focus and selection with arrow, Home, and End keys", () => {
    const result = parseQueryResponse({
      number_of_hits: 3,
      result_columns: [
        { attribute: "name", values: { type: "string", values: ["Jane", "Joe", "Alex"] } },
        { attribute: "age", values: { type: "int", values: [34, 41, 29] } },
      ],
    });
    const select = vi.fn();
    render(() => (
      <DataTable
        ariaLabel="People"
        result={result}
        columns={[{ column: result.requireColumn("name"), header: "Name" }]}
        rowKey={result.requireColumn("name")}
        onRowSelect={select}
      />
    ));
    const jane = screen.getByRole("row", { name: "Jane" });
    const joe = screen.getByRole("row", { name: "Joe" });
    const alex = screen.getByRole("row", { name: "Alex" });
    expect(jane.tabIndex).toBe(0);
    expect(joe.tabIndex).toBe(-1);

    jane.focus();
    fireEvent.keyDown(jane, { key: "ArrowDown" });
    expect(document.activeElement).toBe(joe);
    expect(select).toHaveBeenLastCalledWith(result.rows[1]);
    expect(joe.tabIndex).toBe(0);
    fireEvent.keyDown(joe, { key: "End" });
    expect(document.activeElement).toBe(alex);
    expect(select).toHaveBeenLastCalledWith(result.rows[2]);
    fireEvent.keyDown(alex, { key: "Home" });
    expect(document.activeElement).toBe(jane);
    expect(select).toHaveBeenLastCalledWith(result.rows[0]);
    const selectionCount = select.mock.calls.length;
    fireEvent.keyDown(jane, { key: "ArrowUp" });
    expect(document.activeElement).toBe(jane);
    expect(select).toHaveBeenCalledTimes(selectionCount);
  });

  it("renders only the visible subset of a virtualized result", async () => {
    const heights = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.style.maxHeight === "400px" ? 400 : 40;
    });
    const names = Array.from({ length: 1_000 }, (_, index) => `Person ${index + 1}`);
    const result = parseQueryResponse({
      number_of_hits: names.length,
      result_columns: [{ attribute: "name", values: { type: "string", values: names } }],
    });

    render(() => (
      <DataTable
        ariaLabel="Large people list"
        result={result}
        columns={[{ column: result.requireColumn("name"), header: "Name" }]}
        virtualization={{ height: 400, estimatedRowHeight: 40 }}
      />
    ));

    const table = screen.getByRole("table", { name: "Large people list" });
    expect(table.getAttribute("aria-rowcount")).toBe("1001");
    expect(table.style.getPropertyValue("--data-table-columns")).toBe("minmax(150px, 1fr)");
    expect(table.querySelector("tbody")?.style.maxHeight).toBe("400px");
    expect(table.parentElement?.style.maxHeight).toBe("");
    await waitFor(() => expect(screen.getByText("Person 1")).toBeTruthy());
    expect(screen.queryByText("Person 1000")).toBeNull();
    expect(screen.getAllByRole("row").length).toBeLessThan(30);
    heights.mockRestore();
  });
});
