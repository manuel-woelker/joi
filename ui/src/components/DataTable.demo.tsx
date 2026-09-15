import { createMemo, createSignal } from "solid-js";

import type { ComponentDemo } from "../plugins/core/playground/demo";
import { parseQueryResponse } from "../plugins/core/query/query-result";
import { Badge } from "./Badge";
import { DataTable, type DataTableSort } from "./DataTable";

const result = parseQueryResponse({
  number_of_hits: 3,
  result_columns: [
    { attribute: "key", values: { type: "string", values: ["TEST-1", "TEST-2", "TEST-3"] } },
    { attribute: "title", values: { type: "string", values: ["Fix navigation", "Add filters", "Review schema"] } },
    { attribute: "status", values: { type: "string", values: ["Open", "In progress", "Closed"] } },
  ],
});

function InteractiveTable() {
  const [selected, setSelected] = createSignal("None");
  return (
    <div>
      <DataTable
        ariaLabel="Example tickets"
        result={result}
        density="compact"
        rowKey={result.requireColumn("key")}
        selectedRowKey={selected() === "None" ? undefined : selected()}
        onRowSelect={(row) => setSelected(String(row.value(result.requireColumn("key"))))}
        columns={[
          { column: result.requireColumn("key"), header: "Key", width: 100 },
          { column: result.requireColumn("title"), header: "Title" },
          {
            column: result.requireColumn("status"),
            header: "Status",
            cell: (value) => (
              <Badge size="compact" tone={value === "Closed" ? "success" : "primary"}>
                {value}
              </Badge>
            ),
          },
        ]}
      />
      <p>Selected: {selected()}</p>
    </div>
  );
}

function ProviderSortedTable() {
  const [sorting, setSorting] = createSignal<readonly DataTableSort[]>([
    { attribute: "status", direction: "ascending" },
    { attribute: "key", direction: "descending" },
  ]);
  const rows = createMemo(() => {
    const current = sorting();
    return [...result.rows].sort((left, right) => {
      for (const sort of current) {
        const column = result.requireColumn(sort.attribute);
        const comparison = String(left.value(column)).localeCompare(String(right.value(column)), undefined, {
          numeric: true,
        });
        if (comparison) return sort.direction === "ascending" ? comparison : -comparison;
      }
      return 0;
    });
  });
  return (
    <DataTable
      ariaLabel="Provider-sorted tickets"
      result={result}
      rows={rows()}
      sorting={sorting()}
      onSortingChange={setSorting}
      rowKey={result.requireColumn("key")}
      density="compact"
      columns={[
        { column: result.requireColumn("key"), header: "Key", width: 100 },
        { column: result.requireColumn("title"), header: "Title" },
        { column: result.requireColumn("status"), header: "Status" },
      ]}
    />
  );
}

const emptyResult = parseQueryResponse({
  number_of_hits: 0,
  result_columns: [
    { attribute: "key", values: { type: "string", values: [] } },
    { attribute: "title", values: { type: "string", values: [] } },
  ],
});

const multiColumnResult = parseQueryResponse({
  number_of_hits: 8,
  result_columns: [
    {
      attribute: "key",
      values: {
        type: "string",
        values: ["TEST-8", "TEST-2", "TEST-6", "TEST-1", "TEST-7", "TEST-3", "TEST-5", "TEST-4"],
      },
    },
    {
      attribute: "status",
      values: { type: "string", values: ["Open", "Closed", "Open", "Open", "Closed", "Open", "Closed", "Closed"] },
    },
    { attribute: "priority", values: { type: "int", values: [2, 1, 1, 2, 2, 1, 2, 1] } },
    {
      attribute: "estimate",
      values: { type: "string", values: [2.5, 1.25, 1.25, 2.5, 3.75, 1.25, 3.75, 1.25].map(String) },
    },
    { attribute: "delta", values: { type: "int", values: [-3, 2, -1, 4, -2, 0, 3, -4] } },
    {
      attribute: "assignee",
      values: { type: "string", values: ["Jane", "Joe", "Joe", "Alex", "Alex", "Jane", "Jane", "Alex"] },
    },
    {
      attribute: "updated",
      values: {
        type: "string",
        values: [
          "2026-09-15",
          "2026-09-12",
          "2026-09-14",
          "2026-09-11",
          "2026-09-13",
          "2026-09-10",
          "2026-09-09",
          "2026-09-08",
        ],
      },
    },
    {
      attribute: "started",
      values: { type: "string", values: ["09:30", "13:15", "08:45", "16:20", "11:00", "14:40", "07:50", "12:10"] },
    },
  ],
});

function MultiColumnSortedTable() {
  const numericAttributes = new Set(["priority", "estimate", "delta"]);
  const [sorting, setSorting] = createSignal<readonly DataTableSort[]>([
    { attribute: "status", direction: "ascending" },
    { attribute: "priority", direction: "descending" },
    { attribute: "estimate", direction: "ascending" },
    { attribute: "delta", direction: "descending" },
    { attribute: "updated", direction: "ascending" },
    { attribute: "started", direction: "descending" },
  ]);
  const rows = createMemo(() => {
    const current = sorting();
    return [...multiColumnResult.rows].sort((left, right) => {
      for (const sort of current) {
        const column = multiColumnResult.requireColumn(sort.attribute);
        const leftValue = left.value(column);
        const rightValue = right.value(column);
        const comparison = numericAttributes.has(sort.attribute)
          ? Number(leftValue) - Number(rightValue)
          : String(leftValue).localeCompare(String(rightValue));
        if (comparison) return sort.direction === "ascending" ? comparison : -comparison;
      }
      return 0;
    });
  });
  return (
    <DataTable
      ariaLabel="Tickets sorted by multiple columns"
      result={multiColumnResult}
      rows={rows()}
      sorting={sorting()}
      onSortingChange={setSorting}
      rowKey={multiColumnResult.requireColumn("key")}
      density="compact"
      columns={[
        { column: multiColumnResult.requireColumn("key"), header: "Key", width: 100 },
        { column: multiColumnResult.requireColumn("status"), header: "Status" },
        { column: multiColumnResult.requireColumn("priority"), header: "Integer" },
        { column: multiColumnResult.requireColumn("estimate"), header: "Real", type: "number" },
        { column: multiColumnResult.requireColumn("delta"), header: "Negative" },
        { column: multiColumnResult.requireColumn("assignee"), header: "Assignee" },
        { column: multiColumnResult.requireColumn("updated"), header: "Updated", type: "date" },
        { column: multiColumnResult.requireColumn("started"), header: "Started", type: "time" },
      ]}
    />
  );
}

const virtualResult = parseQueryResponse({
  number_of_hits: 1_000,
  result_columns: [
    {
      attribute: "key",
      values: { type: "string", values: Array.from({ length: 1_000 }, (_, index) => `TEST-${index + 1}`) },
    },
    {
      attribute: "title",
      values: { type: "string", values: Array.from({ length: 1_000 }, (_, index) => `Generated issue ${index + 1}`) },
    },
    {
      attribute: "priority",
      values: { type: "int", values: Array.from({ length: 1_000 }, (_, index) => (index % 5) + 1) },
    },
  ],
});

export default {
  name: "Data Table",
  description: "A generic TanStack-backed table over typed columnar query results.",
  scenarios: [
    {
      name: "Empty",
      render: () => (
        <DataTable
          ariaLabel="Empty tickets"
          result={emptyResult}
          columns={[
            { column: emptyResult.requireColumn("key"), header: "Key" },
            { column: emptyResult.requireColumn("title"), header: "Title" },
          ]}
        />
      ),
    },
    {
      name: "Interactive rows",
      description: "Rows support selection, arrow-key navigation, and keyboard activation.",
      render: () => <InteractiveTable />,
    },
    {
      name: "Provider sorting",
      description: "Click a heading for one sort or Shift-click headings to build a provider-driven sort order.",
      render: () => <ProviderSortedTable />,
    },
    {
      name: "Multi-column sorting",
      description: "Repeated values make the three provider-controlled sort priorities visible in the row order.",
      render: () => <MultiColumnSortedTable />,
    },
    {
      name: "Virtual scrolling",
      description: "A 1,000-row result renders only the visible rows while scrolling.",
      render: () => (
        <DataTable
          ariaLabel="One thousand tickets"
          result={virtualResult}
          density="compact"
          rowKey={virtualResult.requireColumn("key")}
          virtualization={{ height: 420, estimatedRowHeight: 33 }}
          columns={[
            { column: virtualResult.requireColumn("key"), header: "Key", width: 110 },
            { column: virtualResult.requireColumn("title"), header: "Title" },
            { column: virtualResult.requireColumn("priority"), header: "Priority", width: 90 },
          ]}
        />
      ),
    },
  ],
} satisfies ComponentDemo;
