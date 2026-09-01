import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
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
});
