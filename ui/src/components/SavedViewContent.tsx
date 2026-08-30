import { For, Show, createMemo, createResource } from "solid-js";

import { bindEntity, createEntityTableColumns } from "../entities/bound-entity";
import { createEntityEditorDefinition } from "../entities/entity-editor";
import { ticketEntity } from "../entities/ticket-entity";
import type { QueryColumnHandle, QueryResult } from "../query/query-result";
import { MasterDetailView } from "../master-detail/MasterDetailView";
import { fetchService } from "../services/fetch-service";
import { useWorkspace } from "../workspace/controller";
import { executeQuery, validatePresentation } from "../workspace/query";
import { loadTickets } from "../workspace/ticket-api";
import { DataTable } from "./DataTable";
import { IconButton } from "./IconButton";
import styles from "./ViewContent.module.css";

const ticketEditor = createEntityEditorDefinition(ticketEntity);

export function SavedViewCommands() {
  const controller = useWorkspace();
  return (
    <>
      <IconButton label="New ticket" icon="+" onClick={() => controller.createRecord()} />
      <IconButton label="Configure view" icon="⚙" onClick={() => controller.setEditorOpen(true)} />
    </>
  );
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
  const boundEntity = createMemo(() => {
    const result = ticketRecords();
    return result ? bindEntity(result, ticketEntity) : undefined;
  });
  const tableColumns = createMemo(() => {
    const entity = boundEntity();
    return entity
      ? createEntityTableColumns(
          entity,
          (presentation()?.fields ?? []).map((field) => ({
            attribute: field.field,
            label: field.label,
            width: field.width,
          })),
          {
            status: {
              cell: (value) => <span class={`${styles.status} ${styles[String(value)]}`}>{String(value ?? "")}</span>,
            },
          },
        )
      : [];
  });
  const listColumns = createMemo(() => {
    const entity = boundEntity();
    return entity
      ? {
          key: entity.attribute("key").column,
          title: entity.attribute("title").column,
          description: entity.attribute("description").column,
          status: entity.attribute("status").column,
        }
      : undefined;
  });
  const validation = () =>
    query() && presentation() ? validatePresentation(query()!, presentation()!) : "View configuration is incomplete.";

  const master = (
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
                        <article
                          tabIndex={0}
                          role="link"
                          onClick={() => openTicket(controller, row, ticketRecords()?.column("id"))}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openTicket(controller, row, ticketRecords()?.column("id"));
                            }
                          }}
                        >
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
                  onRowClick={(row) => openTicket(controller, row, ticketRecords()?.column("id"))}
                />
              </Show>
            </Show>
          </Show>
        </Show>
      </Show>
    </>
  );
  return (
    <MasterDetailView
      master={master}
      definition={ticketEditor}
      fetchService={fetchService}
      result={ticketRecords()}
      selectedRecordId={controller.navigation.selectedRecordId()}
      creating={controller.navigation.creatingRecord()}
      onCreated={async (id) => {
        const refreshed = await refetch();
        if (hasRecord(refreshed, id)) controller.finishCreatingRecord(id);
        else {
          controller.closeRecord();
          controller.announce("Ticket created outside the current view.");
        }
      }}
      onClose={() => controller.closeRecord()}
    />
  );
}

function hasRecord(result: QueryResult | null | undefined, id: string): boolean {
  const identity = result?.column("id");
  return Boolean(identity && result?.rows.some((row) => row.value(identity) === id));
}

function openTicket(
  controller: ReturnType<typeof useWorkspace>,
  row: QueryResult["rows"][number],
  idColumn: QueryColumnHandle | undefined,
) {
  const id = idColumn ? row.value(idColumn) : undefined;
  if (typeof id === "string") controller.selectRecord(id);
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
