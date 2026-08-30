import { cleanup, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";

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
});
