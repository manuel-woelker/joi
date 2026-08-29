import { For, Show, createMemo, createResource } from "solid-js";

import type { QueryColumnHandle, QueryResult } from "../query/query-result";
import { fetchService } from "../services/fetch-service";
import { useWorkspace } from "../workspace/controller";
import { executeQuery, validatePresentation } from "../workspace/query";
import { loadTickets } from "../workspace/ticket-api";
import { DataTable, type DataTableColumn } from "./DataTable";
import { IconButton } from "./IconButton";
import styles from "./ViewContent.module.css";

export function SavedViewCommands() {
  const controller = useWorkspace();
  return <IconButton label="Configure view" icon="⚙" onClick={() => controller.setEditorOpen(true)} />;
}

export function SavedViewContent() {
  const controller = useWorkspace();
  const query = () => {
    const view = controller.selectedView();
    return view ? controller.workspace.queries[view.queryId] : undefined;
  };
  const [ticketRecords, { refetch }] = createResource(query, (currentQuery) => loadTickets(fetchService, currentQuery));
  const presentation = () => {
    const view = controller.selectedView();
    return view ? controller.workspace.presentations[view.presentationId] : undefined;
  };
  const records = createMemo(() => {
    const result = ticketRecords();
    const currentQuery = query();
    return result && currentQuery ? executeQuery(result, currentQuery, controller.search()) : [];
  });
  const tableColumns = createMemo<DataTableColumn[]>(() => {
    const result = ticketRecords();
    return result
      ? (presentation()?.fields ?? []).map((field) => ({
          column: result.requireColumn(field.field),
          header: field.label,
          width: field.width,
          cell:
            field.field === "status"
              ? (value) => <span class={`${styles.status} ${styles[String(value)]}`}>{String(value ?? "")}</span>
              : undefined,
        }))
      : [];
  });
  const listColumns = createMemo(() => {
    const result = ticketRecords();
    return result
      ? {
          key: result.requireColumn("key"),
          title: result.requireColumn("title"),
          description: result.requireColumn("description"),
          status: result.requireColumn("status"),
        }
      : undefined;
  });
  const validation = () =>
    query() && presentation() ? validatePresentation(query()!, presentation()!) : "View configuration is incomplete.";

  return (
    <>
      <div class={styles.viewToolbar}>
        <label class={styles.searchField}>
          <span class={styles.iconGlyph} aria-hidden="true">
            ⌕
          </span>
          <span class={styles.srOnly}>Search issues</span>
          <input
            value={controller.search()}
            onInput={(event) => controller.setSearch(event.currentTarget.value)}
            placeholder="Search this view"
          />
        </label>
        <span class={styles.resultCount}>
          {ticketRecords.loading ? "Loading" : resultCount(ticketRecords(), records().length)}
        </span>
      </div>
      <Show when={!validation()} fallback={<div class={styles.errorState}>{validation()}</div>}>
        <Show
          when={!ticketRecords.loading}
          fallback={
            <div class={`${styles.emptyState} ${styles.compact}`}>
              <h2>Loading issues</h2>
            </div>
          }
        >
          <Show
            when={!ticketRecords.error}
            fallback={
              <div class={styles.errorState}>
                <p>Tickets could not be loaded.</p>
                <button class={styles.secondary} onClick={() => refetch()}>
                  Retry
                </button>
              </div>
            }
          >
            <Show
              when={records().length}
              fallback={
                <div class={`${styles.emptyState} ${styles.compact}`}>
                  <h2>No matching issues</h2>
                  <p>Adjust the search or view query.</p>
                </div>
              }
            >
              <Show
                when={presentation()?.layout === "table"}
                fallback={
                  <div class={styles.issueList}>
                    <For each={records()}>
                      {(row) => (
                        <article>
                          <div>
                            <strong>{rowValue(row, listColumns()?.title)}</strong>
                            <span>{rowValue(row, listColumns()?.description)}</span>
                          </div>
                          <div class={styles.issueMeta}>
                            <span class={`${styles.status} ${styles[rowValue(row, listColumns()?.status)]}`}>
                              {rowValue(row, listColumns()?.status)}
                            </span>
                            <span>{rowValue(row, listColumns()?.key)}</span>
                          </div>
                        </article>
                      )}
                    </For>
                  </div>
                }
              >
                <DataTable
                  ariaLabel={controller.selectedView()?.name ?? "Issues"}
                  result={ticketRecords()!}
                  rows={records()}
                  columns={tableColumns()}
                  rowKey={ticketRecords()?.column("id")}
                  density={presentation()?.density}
                />
              </Show>
            </Show>
          </Show>
        </Show>
      </Show>
    </>
  );
}

function rowValue(row: QueryResult["rows"][number], column: QueryColumnHandle | undefined): string {
  return column ? String(row.value(column) ?? "") : "";
}

function resultCount(result: QueryResult | undefined, visibleRows: number): string {
  if (!result) return "0 issues";
  return visibleRows === result.numberOfHits
    ? `${result.numberOfHits} issues`
    : `${visibleRows} of ${result.numberOfHits} issues`;
}
