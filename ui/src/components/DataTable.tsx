import { createSolidTable, flexRender, getCoreRowModel, type ColumnDef } from "@tanstack/solid-table";
import { For, createMemo, type JSX } from "solid-js";

import type { QueryColumnHandle, QueryResult, QueryResultRow, QueryValue } from "../query/query-result";
import styles from "./DataTable.module.css";

export interface DataTableColumn {
  readonly column: QueryColumnHandle;
  readonly header: string;
  readonly width?: number;
  readonly cell?: (value: QueryValue | undefined, row: QueryResultRow, column: QueryColumnHandle) => JSX.Element;
}

export interface DataTableProps {
  readonly ariaLabel: string;
  readonly result: QueryResult;
  readonly rows?: readonly QueryResultRow[];
  readonly columns: readonly DataTableColumn[];
  readonly density?: "compact" | "comfortable";
  readonly rowKey?: QueryColumnHandle;
  readonly onRowClick?: (row: QueryResultRow) => void;
}

export function DataTable(props: DataTableProps) {
  const columns = createMemo<ColumnDef<QueryResultRow>[]>(() =>
    props.columns.map((definition) => ({
      id: definition.column.attribute,
      accessorFn: (row) => row.value(definition.column),
      header: definition.header,
      cell: (context) => {
        const value = context.getValue() as QueryValue | undefined;
        return definition.cell
          ? definition.cell(value, context.row.original, definition.column)
          : value === undefined
            ? ""
            : String(value);
      },
    })),
  );
  const columnById = createMemo(() => new Map(props.columns.map((column) => [column.column.attribute, column])));
  const rows = createMemo(() => Array.from(props.rows ?? props.result.rows));
  const table = createSolidTable({
    get data() {
      return rows();
    },
    get columns() {
      return columns();
    },
    getRowId(row) {
      const key = props.rowKey ? row.value(props.rowKey) : undefined;
      return key === undefined ? String(row.index) : String(key);
    },
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div class={styles.tableScroll}>
      <table class={styles.table} aria-label={props.ariaLabel} data-density={props.density ?? "comfortable"}>
        <thead>
          <For each={table.getHeaderGroups()}>
            {(headerGroup) => (
              <tr>
                <For each={headerGroup.headers}>
                  {(header) => (
                    <th
                      style={{
                        width: columnById().get(header.column.id)?.width
                          ? `${columnById().get(header.column.id)?.width}px`
                          : undefined,
                      }}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  )}
                </For>
              </tr>
            )}
          </For>
        </thead>
        <tbody>
          <For each={table.getRowModel().rows}>
            {(row) => (
              <tr
                data-row-id={row.id}
                class={props.onRowClick ? styles.clickableRow : undefined}
                tabIndex={props.onRowClick ? 0 : undefined}
                onClick={() => props.onRowClick?.(row.original)}
                onKeyDown={(event) => {
                  if (props.onRowClick && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    props.onRowClick(row.original);
                  }
                }}
              >
                <For each={row.getVisibleCells()}>
                  {(cell) => <td>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
