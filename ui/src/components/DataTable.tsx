import { type ColumnDef, createSolidTable, flexRender, getCoreRowModel, type Row } from "@tanstack/solid-table";
import { createVirtualizer } from "@tanstack/solid-virtual";
import { createEffect, createMemo, createSignal, For, type JSX, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";

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
  readonly virtualization?: {
    readonly height: number;
    readonly estimatedRowHeight?: number;
    readonly overscan?: number;
  };
}

export function DataTable(props: DataTableProps) {
  let scrollElement: HTMLTableSectionElement | undefined;
  let tableElement: HTMLTableElement | undefined;
  let finishColumnResize: (() => void) | undefined;
  let removeColumnDragListeners: (() => void) | undefined;
  let pendingColumnDrag:
    | {
        columnId: string;
        label: string;
        pointerId: number;
        startX: number;
        startY: number;
        originalOrder: string[];
      }
    | undefined;
  const [focusedRowId, setFocusedRowId] = createSignal<string>();
  const [scrollbarWidth, setScrollbarWidth] = createSignal(0);
  const [draggedColumnId, setDraggedColumnId] = createSignal<string>();
  const [columnDragPosition, setColumnDragPosition] = createSignal({ x: 0, y: 0 });
  const [resizingColumnId, setResizingColumnId] = createSignal<string>();
  const columns = createMemo<ColumnDef<QueryResultRow>[]>(() =>
    props.columns.map((definition) => ({
      id: definition.column.attribute,
      accessorFn: (row) => row.value(definition.column),
      header: definition.header,
      cell: (context) => <DataTableCell definition={definition} row={context.row.original} />,
      size: definition.width,
      minSize: 32,
    })),
  );
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
    columnResizeMode: "onChange",
    enableColumnResizing: true,
  });
  const tableRows = () => table.getRowModel().rows;
  const virtualizer = createVirtualizer<HTMLTableSectionElement, HTMLTableRowElement>({
    get count() {
      return props.virtualization ? tableRows().length : 0;
    },
    getScrollElement: () => scrollElement ?? null,
    estimateSize: () => props.virtualization?.estimatedRowHeight ?? (props.density === "compact" ? 33 : 41),
    get overscan() {
      return props.virtualization?.overscan ?? 5;
    },
    initialRect: {
      width: 0,
      height: props.virtualization?.height ?? 0,
    },
  });
  const virtualItems = () => virtualizer.getVirtualItems();
  const paddingTop = () => virtualItems()[0]?.start ?? 0;
  const paddingBottom = () => {
    const last = virtualItems().at(-1);
    return last ? virtualizer.getTotalSize() - last.end : 0;
  };
  const columnTemplate = () => {
    const visibleColumns = table.getVisibleLeafColumns();
    return visibleColumns
      .map((column, index) =>
        index === visibleColumns.length - 1 ? `minmax(${column.getSize()}px, 1fr)` : `${column.getSize()}px`,
      )
      .join(" ");
  };
  const reorderColumn = (sourceId: string, targetIndex: number) => {
    const order = table.getAllLeafColumns().map((column) => column.id);
    const sourceIndex = order.indexOf(sourceId);
    if (sourceIndex < 0) return;
    order.splice(sourceIndex, 1);
    order.splice(Math.max(0, Math.min(targetIndex, order.length)), 0, sourceId);
    table.setColumnOrder(order);
  };
  const moveColumn = (columnId: string, offset: -1 | 1) => {
    const order = table.getAllLeafColumns().map((column) => column.id);
    const sourceIndex = order.indexOf(columnId);
    const targetIndex = sourceIndex + offset;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= order.length) return;
    [order[sourceIndex], order[targetIndex]] = [order[targetIndex], order[sourceIndex]];
    table.setColumnOrder(order);
  };
  const previewColumnAtPointer = (clientX: number, pending: NonNullable<typeof pendingColumnDrag>) => {
    const remaining = table
      .getAllLeafColumns()
      .map((column) => column.id)
      .filter((columnId) => columnId !== pending.columnId);
    const tableBounds = tableElement?.getBoundingClientRect();
    const headerBounds = tableElement?.tHead?.getBoundingClientRect();
    const availableWidth = headerBounds?.width || tableBounds?.width || table.getTotalSize();
    const tableLeft = headerBounds?.left ?? tableBounds?.left ?? 0;
    const candidates: { index: number; center: number }[] = [];
    for (let index = 0; index <= remaining.length; index += 1) {
      const candidateOrder = [...remaining];
      candidateOrder.splice(index, 0, pending.columnId);
      const widths = candidateOrder.map((columnId) => table.getColumn(columnId)?.getSize() ?? 0);
      const fixedWidth = widths.slice(0, -1).reduce((sum, width) => sum + width, 0);
      widths[widths.length - 1] = Math.max(widths.at(-1) ?? 0, availableWidth - fixedWidth);
      const columnLeft = tableLeft + widths.slice(0, index).reduce((sum, width) => sum + width, 0);
      const columnRight = columnLeft + widths[index];
      if (clientX >= columnLeft && clientX <= columnRight) {
        candidates.push({ index, center: columnLeft + widths[index] / 2 });
      }
    }
    const destination = candidates.sort(
      (left, right) => Math.abs(clientX - left.center) - Math.abs(clientX - right.center),
    )[0];
    if (destination) reorderColumn(pending.columnId, destination.index);
  };
  const finishColumnDrag = (commit: boolean) => {
    if (!commit && pendingColumnDrag) table.setColumnOrder(pendingColumnDrag.originalOrder);
    removeColumnDragListeners?.();
    removeColumnDragListeners = undefined;
    pendingColumnDrag = undefined;
    setDraggedColumnId(undefined);
  };
  const trackColumnDrag = (pending: NonNullable<typeof pendingColumnDrag>) => {
    removeColumnDragListeners?.();
    const move = (event: PointerEvent) => {
      if (pendingColumnDrag?.pointerId !== event.pointerId) return;
      if (!draggedColumnId() && Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) < 6) return;
      event.preventDefault();
      if (!draggedColumnId()) setDraggedColumnId(pending.columnId);
      setColumnDragPosition({ x: event.clientX, y: event.clientY });
      previewColumnAtPointer(event.clientX, pending);
    };
    const release = (event: PointerEvent) => {
      if (pendingColumnDrag?.pointerId === event.pointerId) finishColumnDrag(true);
    };
    const cancel = (event: PointerEvent) => {
      if (pendingColumnDrag?.pointerId === event.pointerId) finishColumnDrag(false);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", cancel);
    removeColumnDragListeners = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", cancel);
    };
  };
  const beginColumnResize = (
    columnId: string,
    event: MouseEvent | TouchEvent,
    resize: (event: MouseEvent | TouchEvent) => void,
  ) => {
    finishColumnResize?.();
    setResizingColumnId(columnId);
    const releaseEvent = event instanceof MouseEvent ? "mouseup" : "touchend";
    const finish = () => {
      setResizingColumnId(undefined);
      document.removeEventListener(releaseEvent, finish);
      finishColumnResize = undefined;
    };
    finishColumnResize = finish;
    document.addEventListener(releaseEvent, finish);
    resize(event);
  };
  onCleanup(() => finishColumnResize?.());
  onCleanup(() => finishColumnDrag(false));
  createEffect(() => {
    if (!resizingColumnId() && !draggedColumnId()) return;
    const previousUserSelect = document.documentElement.style.userSelect;
    const previousWebkitUserSelect = document.documentElement.style.webkitUserSelect;
    document.documentElement.style.userSelect = "none";
    document.documentElement.style.webkitUserSelect = "none";
    onCleanup(() => {
      document.documentElement.style.userSelect = previousUserSelect;
      document.documentElement.style.webkitUserSelect = previousWebkitUserSelect;
    });
  });
  createEffect(() => {
    if (!draggedColumnId()) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") finishColumnDrag(false);
    };
    document.addEventListener("keydown", cancel);
    onCleanup(() => document.removeEventListener("keydown", cancel));
  });

  onMount(() => {
    if (!props.virtualization || !scrollElement) return;
    const updateScrollbarWidth = () =>
      setScrollbarWidth(Math.max(0, scrollElement!.offsetWidth - scrollElement!.clientWidth));
    updateScrollbarWidth();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(updateScrollbarWidth);
    observer?.observe(scrollElement);
    window.addEventListener("resize", updateScrollbarWidth);
    onCleanup(() => {
      observer?.disconnect();
      window.removeEventListener("resize", updateScrollbarWidth);
    });
  });

  const renderRow = (row: Row<QueryResultRow>, virtualIndex?: number) => (
    <tr
      ref={
        virtualIndex === undefined
          ? undefined
          : (element) => queueMicrotask(() => element.isConnected && virtualizer.measureElement(element))
      }
      data-index={virtualIndex}
      data-row-id={row.id}
      aria-rowindex={virtualIndex === undefined ? undefined : virtualIndex + 2}
      class={props.onRowSelect || props.onRowActivate ? styles.clickableRow : undefined}
      tabIndex={
        props.onRowSelect || props.onRowActivate
          ? isTabStop(props, row.id, row.original, tableRows()[0]?.id, focusedRowId())
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
        const destination = navigationDestination(event.key, row.id, tableRows());
        if (destination) {
          event.preventDefault();
          setFocusedRowId(destination.id);
          if (destination.id !== row.id) props.onRowSelect?.(destination.original);
          if (props.virtualization) {
            virtualizer.scrollToIndex(destination.index);
            requestAnimationFrame(() => focusRow(event.currentTarget, destination.id));
          } else {
            focusRow(event.currentTarget, destination.id);
          }
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
  );

  return (
    <div class={styles.tableScroll} classList={{ [styles.virtualized]: Boolean(props.virtualization) }}>
      <table
        ref={tableElement}
        class={styles.table}
        aria-label={props.ariaLabel}
        aria-rowcount={props.virtualization ? tableRows().length + 1 : undefined}
        data-density={props.density ?? "comfortable"}
        style={{
          "--data-table-columns": columnTemplate(),
          "--data-table-content-width": `${table.getTotalSize()}px`,
          "--data-table-scrollbar-width": `${scrollbarWidth()}px`,
        }}
      >
        <thead>
          <For each={table.getHeaderGroups()}>
            {(headerGroup) => (
              <tr>
                <For each={headerGroup.headers}>
                  {(header) => (
                    <th
                      aria-label={String(header.column.columnDef.header)}
                      classList={{
                        [styles.draggingColumn]: draggedColumnId() === header.column.id,
                      }}
                      data-column-id={header.column.id}
                      tabIndex={header.isPlaceholder ? undefined : 0}
                      onPointerDown={(event) => {
                        if (header.isPlaceholder || resizingColumnId() || event.button !== 0) return;
                        pendingColumnDrag = {
                          columnId: header.column.id,
                          label: String(header.column.columnDef.header),
                          pointerId: event.pointerId,
                          startX: event.clientX,
                          startY: event.clientY,
                          originalOrder: table.getAllLeafColumns().map((column) => column.id),
                        };
                        trackColumnDrag(pendingColumnDrag);
                      }}
                      onKeyDown={(event) => {
                        if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
                          event.preventDefault();
                          moveColumn(header.column.id, event.key === "ArrowLeft" ? -1 : 1);
                        }
                      }}
                    >
                      <span class={styles.headerLabel}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
                      <Show when={!header.isPlaceholder && header.column.getCanResize()}>
                        <span
                          class={styles.resizeHandle}
                          classList={{ [styles.resizing]: header.column.getIsResizing() }}
                          role="separator"
                          aria-label={`Resize ${String(header.column.columnDef.header)} column`}
                          aria-orientation="vertical"
                          aria-valuemin={header.column.columnDef.minSize}
                          aria-valuemax={header.column.columnDef.maxSize}
                          aria-valuenow={header.column.getSize()}
                          draggable={false}
                          tabIndex={0}
                          onDragStart={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                          onMouseDown={(event) => {
                            event.stopPropagation();
                            beginColumnResize(header.column.id, event, header.getResizeHandler());
                          }}
                          onTouchStart={(event) => {
                            event.stopPropagation();
                            beginColumnResize(header.column.id, event, header.getResizeHandler());
                          }}
                          onDblClick={() => header.column.resetSize()}
                          onKeyDown={(event) => {
                            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                            event.preventDefault();
                            event.stopPropagation();
                            const delta = (event.shiftKey ? 32 : 8) * (event.key === "ArrowLeft" ? -1 : 1);
                            table.setColumnSizing((current) => ({
                              ...current,
                              [header.column.id]: Math.max(
                                header.column.columnDef.minSize ?? 0,
                                Math.min(
                                  header.column.columnDef.maxSize ?? Number.POSITIVE_INFINITY,
                                  header.column.getSize() + delta,
                                ),
                              ),
                            }));
                          }}
                        />
                      </Show>
                    </th>
                  )}
                </For>
              </tr>
            )}
          </For>
        </thead>
        <tbody
          ref={(element) => {
            if (props.virtualization) scrollElement = element;
          }}
          style={{ "max-height": props.virtualization ? `${props.virtualization.height}px` : undefined }}
        >
          <Show when={props.virtualization} fallback={<For each={tableRows()}>{(row) => renderRow(row)}</For>}>
            <Show when={paddingTop() > 0}>
              <tr aria-hidden="true">
                <td
                  class={styles.virtualSpacer}
                  colSpan={props.columns.length}
                  style={{ height: `${paddingTop()}px` }}
                />
              </tr>
            </Show>
            <For each={virtualItems()}>{(item) => renderRow(tableRows()[item.index], item.index)}</For>
            <Show when={paddingBottom() > 0}>
              <tr aria-hidden="true">
                <td
                  class={styles.virtualSpacer}
                  colSpan={props.columns.length}
                  style={{ height: `${paddingBottom()}px` }}
                />
              </tr>
            </Show>
          </Show>
        </tbody>
      </table>
      <Show when={draggedColumnId() && pendingColumnDrag}>
        <Portal>
          <div
            class={styles.columnDragPreview}
            data-testid="column-drag-preview"
            aria-hidden="true"
            style={{ left: `${columnDragPosition().x + 12}px`, top: `${columnDragPosition().y + 12}px` }}
          >
            {pendingColumnDrag?.label}
          </div>
        </Portal>
      </Show>
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
