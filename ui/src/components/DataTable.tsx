import { type ColumnDef, createSolidTable, flexRender, getCoreRowModel, type Row } from "@tanstack/solid-table";
import { createVirtualizer } from "@tanstack/solid-virtual";
import ArrowDownIcon from "lucide-solid/icons/arrow-down";
import { createEffect, createMemo, createSignal, For, type JSX, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";

import type { QueryColumnHandle, QueryResult, QueryResultRow, QueryValue } from "../plugins/core/query/query-result";
import styles from "./DataTable.module.css";
import type { CompiledTextNeedle, HighlightSegment } from "./text-highlight";
import { highlightSegments } from "./text-highlight";

export interface DataTableColumn {
  readonly column: QueryColumnHandle;
  readonly header: string;
  readonly width?: number;
  readonly type?: DataTableColumnType;
  readonly sortable?: boolean;
  readonly cell?: (
    value: QueryValue | undefined,
    row: QueryResultRow,
    column: QueryColumnHandle,
    highlights?: readonly CompiledTextNeedle[],
  ) => JSX.Element;
}

export type DataTableColumnType = "text" | "number" | "date" | "time";

export type DataTableSortDirection = "ascending" | "descending";

export interface DataTableSort {
  readonly attribute: string;
  readonly direction: DataTableSortDirection;
}

export interface DataTableColumnFilter {
  readonly value: string;
  readonly onInput: (value: string) => void;
  readonly placeholder?: string;
  readonly ariaLabel?: string;
}

export interface DataTableProps {
  readonly ariaLabel: string;
  readonly result: QueryResult;
  readonly rows?: readonly QueryResultRow[];
  readonly columns: readonly DataTableColumn[];
  /** Precompiled highlight needles per attribute, applied to text cells. */
  readonly highlights?: ReadonlyMap<string, readonly CompiledTextNeedle[]>;
  /** Per-column quick filters rendered below the column headers. */
  readonly columnFilters?: ReadonlyMap<string, DataTableColumnFilter>;
  readonly emptyMessage?: string;
  readonly loading?: boolean;
  readonly loadingMessage?: string;
  readonly fillWidth?: boolean;
  readonly fillHeight?: boolean;
  readonly density?: "compact" | "comfortable";
  readonly rowKey?: QueryColumnHandle;
  readonly selectedRowKey?: QueryValue;
  readonly sorting?: readonly DataTableSort[];
  readonly onSortingChange?: (sorting: readonly DataTableSort[]) => void;
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
  const [rowsInView, setRowsInView] = createSignal<number>();
  const [scrollbarWidth, setScrollbarWidth] = createSignal(0);
  const [draggedColumnId, setDraggedColumnId] = createSignal<string>();
  const [columnDragPosition, setColumnDragPosition] = createSignal({ x: 0, y: 0 });
  const [resizingColumnId, setResizingColumnId] = createSignal<string>();
  const canSort = (attribute: string) =>
    Boolean(
      props.onSortingChange &&
        props.columns.find((column) => column.column.attribute === attribute)?.sortable !== false,
    );
  const sortFor = (attribute: string) => props.sorting?.find((sort) => sort.attribute === attribute);
  const changeSorting = (attribute: string, multi: boolean) => {
    if (!props.onSortingChange) return;
    props.onSortingChange(nextDataTableSorting(props.sorting ?? [], attribute, multi));
  };
  const columns = createMemo<ColumnDef<QueryResultRow>[]>(() =>
    props.columns.map((definition) => ({
      id: definition.column.attribute,
      accessorFn: (row) => row.value(definition.column),
      header: definition.header,
      cell: (context) => (
        <DataTableCell
          definition={definition}
          row={context.row.original}
          highlights={props.highlights?.get(definition.column.attribute)}
        />
      ),
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
  // Pairs each virtual window item with its current row so the list
  // refreshes on data changes even when the window itself is unchanged.
  // Without this, the For below never re-runs on data-only updates: the
  // virtualizer memoizes by index, Solid skips referentially stable items,
  // and stale rows keep rendering against fresh column definitions.
  const virtualRows = createMemo(() => {
    const rows = tableRows();
    return virtualItems().map((item) => ({ item, row: rows[item.index] }));
  });
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
    if ((!props.virtualization && !props.fillHeight) || !scrollElement) return;
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

  onMount(() => {
    if (!scrollElement) return;
    let frame: number | undefined;
    const updateRowsInView = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        const viewport = scrollElement!.getBoundingClientRect();
        if (viewport.height <= 0) {
          setRowsInView(tableRows().length);
          return;
        }
        const visibleRows = Array.from(scrollElement!.querySelectorAll<HTMLTableRowElement>("tr[data-row-id]")).filter(
          (row) => {
            const bounds = row.getBoundingClientRect();
            return bounds.bottom > viewport.top && bounds.top < viewport.bottom;
          },
        ).length;
        setRowsInView(visibleRows);
      });
    };
    const resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(updateRowsInView);
    const mutationObserver = new MutationObserver(updateRowsInView);
    resizeObserver?.observe(scrollElement);
    mutationObserver.observe(scrollElement, { childList: true, subtree: true });
    scrollElement.addEventListener("scroll", updateRowsInView, { passive: true });
    updateRowsInView();
    onCleanup(() => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      scrollElement?.removeEventListener("scroll", updateRowsInView);
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
        {(cell) => (
          <td data-column-type={columnType(props.columns, cell.column.id)}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        )}
      </For>
    </tr>
  );

  return (
    <div
      class={styles.tableScroll}
      classList={{
        [styles.fillWidth]: props.fillWidth,
        [styles.fillHeight]: props.fillHeight,
        [styles.virtualized]: Boolean(props.virtualization),
      }}
    >
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
                      aria-sort={
                        canSort(header.column.id) ? (sortFor(header.column.id)?.direction ?? "none") : undefined
                      }
                      classList={{
                        [styles.draggingColumn]: draggedColumnId() === header.column.id,
                      }}
                      data-column-id={header.column.id}
                      data-column-type={columnType(props.columns, header.column.id)}
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
                        {header.isPlaceholder ? null : (
                          <Show
                            when={canSort(header.column.id)}
                            fallback={flexRender(header.column.columnDef.header, header.getContext())}
                          >
                            <button
                              type="button"
                              class={styles.sortButton}
                              aria-label={sortButtonLabel(
                                String(header.column.columnDef.header),
                                sortFor(header.column.id),
                                props.sorting ?? [],
                              )}
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={(event) => changeSorting(header.column.id, event.shiftKey)}
                            >
                              <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                              <Show when={sortFor(header.column.id)}>
                                {(sort) => (
                                  <span class={styles.sortIndicator} aria-hidden="true">
                                    <span class={styles.sortDirection}>
                                      <For
                                        each={sortDirectionCharacters(
                                          columnType(props.columns, header.column.id),
                                          sort().direction,
                                        )}
                                      >
                                        {(character) => <span>{character}</span>}
                                      </For>
                                    </span>
                                    <ArrowDownIcon class={styles.sortArrow} size={12} strokeWidth={2.25} />
                                    <span class={styles.sortPriority}>
                                      {(props.sorting?.findIndex((item) => item.attribute === header.column.id) ?? 0) +
                                        1}
                                    </span>
                                  </span>
                                )}
                              </Show>
                            </button>
                          </Show>
                        )}
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
          <Show when={props.columnFilters}>
            <tr class={styles.columnFilterRow}>
              <For each={table.getVisibleLeafColumns()}>
                {(column) => (
                  <th data-column-id={column.id} aria-label={`${String(column.columnDef.header)} filter`}>
                    <Show when={props.columnFilters?.get(column.id)}>
                      {(filter) => (
                        <input
                          type="search"
                          class={styles.columnFilter}
                          aria-label={filter().ariaLabel ?? `Filter ${String(column.columnDef.header)}`}
                          placeholder={filter().placeholder ?? "Filter"}
                          value={filter().value}
                          onInput={(event) => filter().onInput(event.currentTarget.value)}
                          onPointerDown={(event) => event.stopPropagation()}
                        />
                      )}
                    </Show>
                  </th>
                )}
              </For>
            </tr>
          </Show>
        </thead>
        <tbody
          ref={(element) => {
            if (props.virtualization || props.fillHeight) scrollElement = element;
          }}
          style={{ "max-height": props.virtualization ? `${props.virtualization.height}px` : undefined }}
        >
          <Show
            when={props.loading}
            fallback={
              <Show
                when={tableRows().length > 0}
                fallback={
                  <tr>
                    <td class={styles.emptyCell} colSpan={props.columns.length}>
                      {props.emptyMessage ?? "No results found."}
                    </td>
                  </tr>
                }
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
                  <For each={virtualRows()}>
                    {(entry) => (entry.row ? renderRow(entry.row, entry.item.index) : undefined)}
                  </For>
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
              </Show>
            }
          >
            <tr class={styles.loadingRow}>
              <td class={styles.loadingCell} colSpan={props.columns.length} role="status">
                <span class={styles.loadingIndicator}>
                  <span class={styles.loadingSpinner} aria-hidden="true" />
                  {props.loadingMessage ?? "Loading..."}
                </span>
              </td>
            </tr>
          </Show>
        </tbody>
      </table>
      <footer class={styles.tableStatus} aria-label="Table status">
        <span>Rows shown: {tableRows().length}</span>
        <span>Rows in view: {rowsInView() ?? tableRows().length}</span>
        <span>Rows selected: {tableRows().filter((row) => isSelected(props, row.original)).length}</span>
        <span>Total rows: {props.result.numberOfHits ?? "Not requested"}</span>
      </footer>
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

/** Computes the next controlled sort state without changing row order locally. */
export function nextDataTableSorting(
  sorting: readonly DataTableSort[],
  attribute: string,
  multi: boolean,
): readonly DataTableSort[] {
  const index = sorting.findIndex((sort) => sort.attribute === attribute);
  const current = sorting[index];
  const nextDirection =
    current?.direction === "ascending" ? "descending" : current?.direction === "descending" ? undefined : "ascending";
  if (!multi) return nextDirection ? [{ attribute, direction: nextDirection }] : [];
  if (!nextDirection) return sorting.filter((sort) => sort.attribute !== attribute);
  if (index < 0) return [...sorting, { attribute, direction: nextDirection }];
  return sorting.map((sort, sortIndex) => (sortIndex === index ? { attribute, direction: nextDirection } : sort));
}

function columnType(columns: readonly DataTableColumn[], attribute: string): DataTableColumnType {
  const definition = columns.find((column) => column.column.attribute === attribute);
  return definition?.type ?? (definition?.column.type === "int" ? "number" : "text");
}

function sortDirectionCharacters(
  type: DataTableColumnType,
  direction: DataTableSortDirection,
): readonly [string, string] {
  const ascending = type === "text" ? (["A", "Z"] as const) : (["0", "9"] as const);
  return direction === "ascending" ? ascending : [ascending[1], ascending[0]];
}

function sortButtonLabel(header: string, sort: DataTableSort | undefined, sorting: readonly DataTableSort[]): string {
  if (!sort) return `Sort by ${header}`;
  const order = sorting.findIndex((item) => item.attribute === sort.attribute) + 1;
  const next = sort.direction === "ascending" ? "descending" : "unsorted";
  return `${header}, ${sort.direction}, priority ${order}. Sort ${next}`;
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

function DataTableCell(props: {
  definition: DataTableColumn;
  row: QueryResultRow;
  highlights?: readonly CompiledTextNeedle[];
}) {
  // Reads stay inside memos: component bodies run once, so a plain const
  // would freeze the first value and miss row updates.
  const value = createMemo(() => props.row.value(props.definition.column));
  const rendered = createMemo(() => {
    if (props.definition.cell) {
      return props.definition.cell(value(), props.row, props.definition.column, props.highlights);
    }
    const current = value();
    return typeof current === "string" || typeof current === "number" ? String(current) : "";
  });
  // Custom cells returning JSX render untouched; plain strings highlight.
  const segments = createMemo(() => {
    const current = rendered();
    return typeof current === "string" && props.highlights?.length
      ? highlightSegments(current, props.highlights)
      : undefined;
  });
  return (
    <>
      <Show when={segments()} fallback={<>{rendered()}</>}>
        {(resolved) => <HighlightedSegments segments={resolved()} />}
      </Show>
    </>
  );
}

function HighlightedSegments(props: { segments: readonly HighlightSegment[] }) {
  return <>{props.segments.map((segment) => (segment.highlighted ? <mark>{segment.text}</mark> : segment.text))}</>;
}
