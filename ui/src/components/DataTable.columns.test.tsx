// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, expect, it, vi } from "vitest";
import { parseQueryResponse } from "../plugins/core/query/query-result";
import { DataTable, type DataTableColumnConfig } from "./DataTable";
import { ContextMenuProvider } from "./context-menu/ContextMenuProvider";

afterEach(cleanup);
const result = (name = "Jane") =>
  parseQueryResponse({
    number_of_hits: 1,
    result_columns: [
      { attribute: "name", values: { type: "string", values: [name] } },
      { attribute: "age", values: { type: "int", values: [30] } },
      { attribute: "status", values: { type: "string", values: ["Open"] } },
    ],
  });
const headers = () =>
  screen
    .getAllByRole("columnheader")
    .filter((header) => header.hasAttribute("aria-label"))
    .map((header) => header.getAttribute("aria-label"));

it("handles an empty catalog without empty data rows", () => {
  render(() => <DataTable ariaLabel="People" result={result()} columns={[]} availableColumns={[]} />);
  expect(screen.getByText("No columns available.")).toBeTruthy();
});

it("adds first, removes, re-adds first and resets without duplicate choices", async () => {
  const data = result();
  const [config, setConfig] = createSignal<DataTableColumnConfig>();
  const columns = [
    { column: data.requireColumn("name"), header: "Name" },
    { column: data.requireColumn("age"), header: "Age", description: "Age in years" },
    { column: data.requireColumn("status"), header: "Status" },
  ];
  render(() => (
    <DataTable
      ariaLabel="People"
      result={data}
      columns={columns.slice(0, 1)}
      availableColumns={columns}
      columnConfig={config()}
      onColumnConfigChange={setConfig}
    />
  ));
  fireEvent.click(screen.getByRole("button", { name: "Columns" }));
  const add = async (label: string) => {
    const input = screen.getByRole("combobox", { name: "Add column" });
    fireEvent.focus(input);
    fireEvent.input(input, { target: { value: label } });
    fireEvent.click(await screen.findByRole("option", { name: new RegExp(label) }));
  };
  await add("Age");
  expect(headers()).toEqual(["Age", "Name"]);
  fireEvent.click(screen.getByRole("button", { name: "Move Age down" }));
  expect(headers()).toEqual(["Name", "Age"]);
  fireEvent.dragStart(screen.getByRole("button", { name: "Drag Age" }));
  fireEvent.dragOver(screen.getByRole("button", { name: "Drag Name" }).closest("li")!);
  fireEvent.drop(screen.getByRole("button", { name: "Drag Name" }).closest("li")!);
  expect(headers()).toEqual(["Age", "Name"]);
  fireEvent.click(screen.getByRole("button", { name: "Remove Age" }));
  expect(headers()).toEqual(["Name"]);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Keep at least one column" }).disabled).toBe(true);
  await add("Age");
  expect(headers()).toEqual(["Age", "Name"]);
  expect(config()?.visible).toEqual(["age", "name"]);
  fireEvent.click(screen.getByRole("button", { name: "Reset columns" }));
  expect(headers()).toEqual(["Name"]);
  expect(config()?.widths).toEqual({});
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("retains visibility across new query handles and reorders only visible columns", async () => {
  const [data, setData] = createSignal(result());
  const [config, setConfig] = createSignal<DataTableColumnConfig>({
    order: ["name", "age", "status"],
    visible: ["name", "status"],
    widths: { status: 150 },
  });
  const onSelect = vi.fn();
  render(() => (
    <DataTable
      ariaLabel="People"
      result={data()}
      rowKey={data().requireColumn("age")}
      onRowSelect={onSelect}
      columns={[{ column: data().requireColumn("name"), header: "Name" }]}
      availableColumns={data().columns.map((column) => ({
        column,
        header: column.attribute === "name" ? "Name" : column.attribute,
      }))}
      columnConfig={config()}
      onColumnConfigChange={setConfig}
    />
  ));
  fireEvent.keyDown(screen.getByRole("columnheader", { name: "Name" }), { key: "ArrowRight", altKey: true });
  expect(headers()).toEqual(["status", "Name"]);
  setData(result("Joe"));
  await waitFor(() => expect(screen.getByText("Joe")).toBeTruthy());
  expect(headers()).toEqual(["status", "Name"]);
  expect(screen.queryByText("30")).toBeNull();
  fireEvent.click(screen.getByText("Joe"));
  expect(onSelect).toHaveBeenCalled();
  expect(config().widths.status).toBe(150);
});

it("provides header remove actions and keeps the final column", () => {
  const data = result();
  const columns = data.columns.map((column) => ({ column, header: column.attribute }));
  render(() => (
    <ContextMenuProvider>
      <DataTable ariaLabel="People" result={data} columns={columns.slice(0, 2)} availableColumns={columns} />
    </ContextMenuProvider>
  ));
  fireEvent.contextMenu(screen.getByRole("columnheader", { name: "name" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Remove column" }));
  expect(headers()).toEqual(["age"]);
  fireEvent.contextMenu(screen.getByRole("columnheader", { name: "age" }));
  expect(screen.getByRole("menuitem", { name: "Remove column" }).getAttribute("aria-disabled")).toBe("true");
  expect(within(screen.getByRole("table")).getAllByRole("cell")[0].textContent).toBe("30");
});

it("resizes and drags visible columns without including hidden widths or persisting previews", () => {
  const data = result();
  const columns = data.columns.map((column) => ({ column, header: column.attribute, width: 100 }));
  const changed = vi.fn();
  render(() => (
    <DataTable
      ariaLabel="People"
      result={data}
      columns={columns}
      availableColumns={columns}
      columnConfig={{ order: ["name", "age", "status"], visible: ["name", "status"], widths: { age: 900 } }}
      onColumnConfigChange={changed}
      columnFilters={
        new Map(["name", "age", "status"].map((id) => [id, { value: () => "", onInput: () => undefined }]))
      }
    />
  ));
  const table = screen.getByRole("table");
  expect(table.style.getPropertyValue("--data-table-content-width")).toBe("200px");
  expect(screen.getAllByRole("searchbox")).toHaveLength(2);
  const handle = screen.getByRole("separator", { name: "Resize name column" });
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ visible: ["name", "status"], widths: { name: 108, age: 900 } }),
  );
  changed.mockClear();
  vi.spyOn(table, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    width: 600,
    height: 100,
    top: 0,
    right: 600,
    bottom: 100,
    left: 0,
    toJSON: () => undefined,
  });
  const header = screen.getByRole("columnheader", { name: "name" });
  fireEvent.pointerDown(header, { button: 0, clientX: 10, pointerId: 1 });
  fireEvent.pointerMove(document, { clientX: 450, pointerId: 1 });
  expect(headers()).toEqual(["status", "name"]);
  expect(changed).not.toHaveBeenCalled();
  fireEvent.pointerUp(document, { pointerId: 1 });
  expect(changed).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ visible: ["status", "name"] }));
  expect(table.style.getPropertyValue("--data-table-columns")).toBe("100px minmax(108px, 1fr)");
});
