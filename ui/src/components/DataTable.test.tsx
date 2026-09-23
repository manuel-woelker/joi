// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseQueryResponse } from "../plugins/core/query/query-result";
import type { PluginRegistryAccess } from "../base/plugin-registry";
import {
  lookupDefinitions,
  lookupEntryId,
  lookupId,
  LookupValue,
  LookupProvider,
} from "../plugins/core/lookups/lookup";
import { DataTable, type DataTableColumn, type DataTableSort } from "./DataTable";
import { compileNeedles, deriveColumnHighlights } from "./text-highlight";

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
  it("shows a reactive filter indicator after sorted and unsortable column labels", () => {
    const result = createResult("Jane", 34);
    const [filtered, setFiltered] = createSignal<ReadonlySet<string>>(new Set(["name", "age"]));
    const [faceted, setFaceted] = createSignal<ReadonlySet<string>>(new Set(["name", "age"]));
    render(() => (
      <DataTable
        ariaLabel="People"
        result={result}
        columns={[
          { column: result.requireColumn("name"), header: "Name" },
          { column: result.requireColumn("age"), header: "Age", sortable: false },
        ]}
        sorting={[{ attribute: "name", direction: "ascending" }]}
        onSortingChange={() => {}}
        filteredAttributes={filtered()}
        facetedAttributes={faceted()}
      />
    ));
    for (const label of ["Name", "Age"]) {
      const header = screen.getByRole("columnheader", { name: label });
      const indicator = header.querySelector('[aria-label="Filtered"]');
      expect(indicator).not.toBeNull();
      expect(indicator?.parentElement?.textContent).toBe(label);
      expect(indicator?.previousSibling?.textContent).toBe(label);
      expect(header.querySelector('[aria-label="Facet applied"]')?.previousSibling).toBe(indicator);
    }
    setFiltered(new Set(["age"]));
    expect(screen.getAllByRole("img", { name: "Filtered" })).toHaveLength(1);
    setFiltered(new Set<string>());
    expect(screen.queryByRole("img", { name: "Filtered" })).toBeNull();
    expect(screen.getAllByRole("img", { name: "Facet applied" })).toHaveLength(2);
    setFaceted(new Set<string>());
    expect(screen.queryByRole("img", { name: "Facet applied" })).toBeNull();
  });

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
    expect(screen.getByLabelText("Table status").textContent).toBe(
      "Rows shown: 1Rows in view: 1Rows selected: 0Total rows: 1",
    );
  });

  it("highlights matches only in the searched column", () => {
    const result = parseQueryResponse({
      number_of_hits: 1,
      result_columns: [
        { attribute: "title", values: { type: "string", values: ["Fix navigation bug"] } },
        { attribute: "description", values: { type: "string", values: ["Navigation is broken"] } },
      ],
    });
    const columns: DataTableColumn[] = [
      { column: result.requireColumn("title"), header: "Title" },
      { column: result.requireColumn("description"), header: "Description" },
    ];
    render(() => (
      <DataTable
        ariaLabel="Tickets"
        result={result}
        columns={columns}
        highlights={deriveColumnHighlights("", ["title", "description"], { title: "navigation" })}
      />
    ));

    const mark = screen.getByText("navigation", { selector: "mark" });
    expect(mark.closest("td")?.cellIndex).toBe(0);
    expect(screen.getByText("Navigation is broken").querySelector("mark")).toBeNull();
    expect(screen.getAllByText("navigation", { selector: "mark" })).toHaveLength(1);
  });

  it("leaves custom cells unhighlighted", () => {
    const result = parseQueryResponse({
      number_of_hits: 1,
      result_columns: [{ attribute: "name", values: { type: "string", values: ["Jane"] } }],
    });
    render(() => (
      <DataTable
        ariaLabel="People"
        result={result}
        columns={[{ column: result.requireColumn("name"), header: "Name", cell: (value) => <strong>{value}!</strong> }]}
        highlights={deriveColumnHighlights("jane", ["name"])}
      />
    ));

    expect(screen.getByText("Jane!").tagName).toBe("STRONG");
    expect(screen.queryByText("Jane", { selector: "mark" })).toBeNull();
  });

  it("highlights numbers and string-returning custom cells", () => {
    const result = parseQueryResponse({
      number_of_hits: 1,
      result_columns: [
        { attribute: "age", values: { type: "int", values: [34] } },
        { attribute: "note", values: { type: "string", values: ["plain label"] } },
      ],
    });
    render(() => (
      <DataTable
        ariaLabel="People"
        result={result}
        columns={[
          { column: result.requireColumn("age"), header: "Age" },
          { column: result.requireColumn("note"), header: "Note", cell: (value) => String(value ?? "") },
        ]}
        highlights={
          new Map([
            ["age", compileNeedles([{ text: "34", wholeWord: false }])],
            ["note", compileNeedles([{ text: "label", wholeWord: false }])],
          ])
        }
      />
    ));

    expect(screen.getByText("34", { selector: "mark" })).toBeTruthy();
    expect(screen.getByText("label", { selector: "mark" })).toBeTruthy();
  });

  it("highlights matched words in lookup labels", async () => {
    const result = parseQueryResponse({
      number_of_hits: 1,
      result_columns: [{ attribute: "project_id", values: { type: "string", values: ["p1"] } }],
    });
    const registry = {
      extensions: (point: unknown) =>
        point === lookupDefinitions
          ? [
              {
                id: lookupId("projects"),
                label: "Project",
                load: async () => [{ id: lookupEntryId("p1"), label: "Test project" }],
              },
            ]
          : [],
      extensionEntries: () => [],
    } as unknown as PluginRegistryAccess;
    render(() => (
      <LookupProvider registry={registry}>
        <DataTable
          ariaLabel="Tickets"
          result={result}
          columns={[
            {
              column: result.requireColumn("project_id"),
              header: "Project",
              cell: (value, _row, _column, highlights) => (
                <LookupValue lookup={lookupId("projects")} value={String(value ?? "")} highlight={highlights} />
              ),
            },
          ]}
          highlights={deriveColumnHighlights("test project", ["project_id"])}
        />
      </LookupProvider>
    ));

    expect(await screen.findByText("Test", { selector: "mark" })).toBeTruthy();
  });

  it("keeps filter inputs stable across column updates", async () => {
    const result = parseQueryResponse({
      number_of_hits: 1,
      result_columns: [{ attribute: "title", values: { type: "string", values: ["Fix navigation bug"] } }],
    });
    const [columns, setColumns] = createSignal<DataTableColumn[]>([
      { column: result.requireColumn("title"), header: "Title" },
    ]);
    const filters = new Map([["title", { value: () => "", onInput: () => {}, placeholder: "Filter Title" }]]);
    render(() => <DataTable ariaLabel="Tickets" result={result} columns={columns()} columnFilters={filters} />);
    const input = screen.getByRole("searchbox", { name: "Filter Title" });
    await userEvent.click(input);
    await userEvent.keyboard("ab");
    // New column identities, as produced after every refetch.
    setColumns([{ column: result.requireColumn("title"), header: "Title" }]);
    await waitFor(() => {
      const current = screen.getByRole("searchbox", { name: "Filter Title" });
      expect(current).toBe(input);
      expect(document.activeElement).toBe(input);
      expect((current as HTMLInputElement).value).toBe("ab");
    });
  });

  it("preserves the caret while typing and syncs external value changes", async () => {
    const result = parseQueryResponse({
      number_of_hits: 1,
      result_columns: [{ attribute: "title", values: { type: "string", values: ["Fix"] } }],
    });
    const [external, setExternal] = createSignal("");
    const filters = new Map([["title", { value: () => external(), onInput: (value: string) => setExternal(value) }]]);
    render(() => (
      <DataTable
        ariaLabel="Tickets"
        result={result}
        columns={[{ column: result.requireColumn("title"), header: "Title" }]}
        columnFilters={filters}
      />
    ));
    const input = screen.getByRole("searchbox", { name: "Filter Title" }) as HTMLInputElement;
    await userEvent.click(input);
    await userEvent.keyboard("ab");
    await userEvent.keyboard("{ArrowLeft}X");
    expect(input.value).toBe("aXb");
    expect(input.selectionStart).toBe(2);
    // External changes (view resets) still clear the input.
    setExternal("cd");
    await waitFor(() => expect(input.value).toBe("cd"));
    setExternal("");
    await waitFor(() => expect(input.value).toBe(""));
  });

  it("reports the right-clicked column to the context menu handler", () => {
    const result = parseQueryResponse({
      number_of_hits: 1,
      result_columns: [
        { attribute: "name", values: { type: "string", values: ["Jane"] } },
        { attribute: "age", values: { type: "int", values: [34] } },
      ],
    });
    const seen: { row: number; column?: string }[] = [];
    render(() => (
      <DataTable
        ariaLabel="People"
        result={result}
        columns={[
          { column: result.requireColumn("name"), header: "Name" },
          { column: result.requireColumn("age"), header: "Age" },
        ]}
        onRowContextMenu={(_event, row, column) => seen.push({ row: row.index, column: column?.attribute })}
      />
    ));

    const nameCell = screen.getByText("Jane").closest("td")!;
    fireEvent.contextMenu(nameCell);
    const ageCell = screen.getByText("34").closest("td")!;
    fireEvent.contextMenu(ageCell);
    expect(seen).toEqual([
      { row: 0, column: "name" },
      { row: 0, column: "age" },
    ]);
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

  it("shows selected rows and an unavailable total", () => {
    const result = parseQueryResponse({
      number_of_hits: null,
      result_columns: [{ attribute: "name", values: { type: "string", values: ["Jane"] } }],
    });
    render(() => (
      <DataTable
        ariaLabel="People"
        result={result}
        columns={[{ column: result.requireColumn("name"), header: "Name" }]}
        rowKey={result.requireColumn("name")}
        selectedRowKey="Jane"
      />
    ));

    expect(screen.getByLabelText("Table status").textContent).toBe(
      "Rows shown: 1Rows in view: 1Rows selected: 1Total rows: Not requested",
    );
  });

  it("counts only rows intersecting the scroll viewport", async () => {
    const result = parseQueryResponse({
      number_of_hits: 3,
      result_columns: [{ attribute: "name", values: { type: "string", values: ["Jane", "Joe", "Alex"] } }],
    });
    render(() => (
      <DataTable
        ariaLabel="People"
        result={result}
        columns={[{ column: result.requireColumn("name"), header: "Name" }]}
        fillHeight
      />
    ));

    const body = screen.getByRole("table", { name: "People" }).querySelector("tbody")!;
    vi.spyOn(body, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ y: 10, height: 40 }));
    const rows = Array.from(body.querySelectorAll("tr[data-row-id]"));
    vi.spyOn(rows[0], "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ y: -20, height: 20 }));
    vi.spyOn(rows[1], "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ y: 20, height: 20 }));
    vi.spyOn(rows[2], "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ y: 40, height: 20 }));

    fireEvent.scroll(body);

    await waitFor(() => expect(screen.getByLabelText("Table status").textContent).toContain("Rows in view: 2"));
  });

  it("renders an empty result message inside the table body", () => {
    const result = parseQueryResponse({
      number_of_hits: 0,
      result_columns: [
        { attribute: "name", values: { type: "string", values: [] } },
        { attribute: "age", values: { type: "int", values: [] } },
      ],
    });
    render(() => (
      <DataTable
        ariaLabel="People"
        result={result}
        columns={[{ column: result.requireColumn("name"), header: "Name" }]}
        emptyMessage="No matching people found."
      />
    ));

    const message = screen.getByText("No matching people found.");
    expect(message.tagName).toBe("TD");
    expect(message.closest("tbody")).toBeTruthy();
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

  it("emits controlled multi-column sorting without sorting rows locally", () => {
    const result = parseQueryResponse({
      number_of_hits: 2,
      result_columns: [
        { attribute: "name", values: { type: "string", values: ["Zoe", "Alex"] } },
        { attribute: "age", values: { type: "int", values: [20, 40] } },
      ],
    });
    const [sorting, setSorting] = createSignal<readonly DataTableSort[]>([]);
    const changes = vi.fn((next: readonly DataTableSort[]) => setSorting(next));
    render(() => (
      <DataTable
        ariaLabel="Sortable people"
        result={result}
        sorting={sorting()}
        onSortingChange={changes}
        columns={[
          { column: result.requireColumn("name"), header: "Name" },
          { column: result.requireColumn("age"), header: "Age" },
        ]}
      />
    ));

    fireEvent.click(screen.getByRole("button", { name: "Sort by Name" }));
    expect(changes).toHaveBeenLastCalledWith([{ attribute: "name", direction: "ascending" }]);
    expect(screen.getByRole("columnheader", { name: "Name" }).getAttribute("aria-sort")).toBe("ascending");
    expect(
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual(["Zoe20", "Alex40"]);

    fireEvent.click(screen.getByRole("button", { name: "Sort by Age" }), { shiftKey: true });
    expect(changes).toHaveBeenLastCalledWith([
      { attribute: "name", direction: "ascending" },
      { attribute: "age", direction: "ascending" },
    ]);
    expect(screen.getByRole("button", { name: /Name, ascending, priority 1/ }).textContent).toContain("1");
    expect(screen.getByRole("button", { name: /Age, ascending, priority 2/ }).textContent).toContain("2");
    expect(screen.getByRole("button", { name: /Name, ascending, priority 1/ }).textContent).toContain("AZ");
    expect(screen.getByRole("button", { name: /Age, ascending, priority 2/ }).textContent).toContain("09");
    expect(screen.getByText("20").closest("td")?.dataset.columnType).toBe("number");

    fireEvent.click(screen.getByRole("button", { name: /Name, ascending/ }), { shiftKey: true });
    expect(changes).toHaveBeenLastCalledWith([
      { attribute: "name", direction: "descending" },
      { attribute: "age", direction: "ascending" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: /Name, descending/ }), { shiftKey: true });
    expect(changes).toHaveBeenLastCalledWith([{ attribute: "age", direction: "ascending" }]);
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

    expect(contextMenu).toHaveBeenCalledWith(
      expect.objectContaining({ clientX: 12, clientY: 24 }),
      result.rows[0],
      undefined,
    );
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
