import { type ColumnDef, createSolidTable, flexRender, getCoreRowModel, type Row } from "@tanstack/solid-table";
import { createMemo, createSignal, For, type JSX } from "solid-js";

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
  readonly selectedRowKey?: QueryValue;
  readonly onRowSelect?: (row: QueryResultRow) => void;
  readonly onRowActivate?: (row: QueryResultRow) => void;
  readonly onRowContextMenu?: (event: MouseEvent, row: QueryResultRow) => void;
}

export function DataTable(props: DataTableProps) {
  const [focusedRowId, setFocusedRowId] = createSignal<string>();
  const columns = createMemo<ColumnDef<QueryResultRow>[]>(() =>
    props.columns.map((definition) => ({
      id: definition.column.attribute,
      accessorFn: (row) => row.value(definition.column),
      header: definition.header,
      cell: (context) => <DataTableCell definition={definition} row={context.row.original} />,
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
                class={props.onRowSelect || props.onRowActivate ? styles.clickableRow : undefined}
                tabIndex={
                  props.onRowSelect || props.onRowActivate
                    ? isTabStop(props, row.id, row.original, table.getRowModel().rows[0]?.id, focusedRowId())
                      ? 0
                      : -1
                    : undefined
                }
                aria-selected={isSelected(props, row.original)}
                onFocus={() => setFocusedRowId(row.id)}
                onClick={(event) => {
                  event.currentTarget.focus();
                  props.onRowSelect?.(row.original);
                }}
                onDblClick={() => props.onRowActivate?.(row.original)}
                onContextMenu={(event) => props.onRowContextMenu?.(event, row.original)}
                onKeyDown={(event) => {
                  const destination = navigationDestination(event.key, row.id, table.getRowModel().rows);
                  if (destination) {
                    event.preventDefault();
                    setFocusedRowId(destination.id);
                    if (destination.id !== row.id) props.onRowSelect?.(destination.original);
                    focusRow(event.currentTarget, destination.id);
                  } else if (event.key === "Enter" && props.onRowActivate) {
                    event.preventDefault();
                    props.onRowActivate(row.original);
                  } else if (event.key === " " && props.onRowSelect) {
                    event.preventDefault();
                    props.onRowSelect(row.original);
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

function isTabStop(
  props: DataTableProps,
  rowId: string,
  row: QueryResultRow,
  firstRowId: string | undefined,
  focusedRowId: string | undefined,
): boolean {
  if (focusedRowId) return rowId === focusedRowId;
  if (props.selectedRowKey !== undefined) return isSelected(props, row) === true;
  return rowId === firstRowId;
}

function navigationDestination(key: string, currentRowId: string, rows: readonly Row<QueryResultRow>[]) {
  const currentIndex = rows.findIndex((row) => row.id === currentRowId);
  if (currentIndex < 0) return undefined;
  const destinationIndex =
    key === "ArrowUp"
      ? Math.max(0, currentIndex - 1)
      : key === "ArrowDown"
        ? Math.min(rows.length - 1, currentIndex + 1)
        : key === "Home"
          ? 0
          : key === "End"
            ? rows.length - 1
            : undefined;
  return destinationIndex === undefined ? undefined : rows[destinationIndex];
}

function focusRow(currentRow: HTMLTableRowElement, rowId: string): void {
  const rows = currentRow.parentElement?.children;
  if (!rows) return;
  for (const row of rows) {
    if (row instanceof HTMLTableRowElement && row.dataset.rowId === rowId) {
      row.focus();
      return;
    }
  }
}

function isSelected(props: DataTableProps, row: QueryResultRow): boolean | undefined {
  if (!props.rowKey || props.selectedRowKey === undefined) return undefined;
  return row.value(props.rowKey) === props.selectedRowKey;
}

function DataTableCell(props: { definition: DataTableColumn; row: QueryResultRow }) {
  return (
    <>
      {props.definition.cell
        ? props.definition.cell(props.row.value(props.definition.column), props.row, props.definition.column)
        : String(props.row.value(props.definition.column) ?? "")}
    </>
  );
}
