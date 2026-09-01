import { createSignal } from "solid-js";

import type { ComponentDemo } from "../playground/demo";
import { parseQueryResponse } from "../query/query-result";
import { Badge } from "./Badge";
import { DataTable } from "./DataTable";

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

const emptyResult = parseQueryResponse({
  number_of_hits: 0,
  result_columns: [
    { attribute: "key", values: { type: "string", values: [] } },
    { attribute: "title", values: { type: "string", values: [] } },
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
  ],
} satisfies ComponentDemo;
