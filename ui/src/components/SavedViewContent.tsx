import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup } from "solid-js";

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
import { useActions } from "../actions/ActionProvider";
import type { EntityRecordActionTarget } from "../actions/action";
import { useApplicationServices } from "../services/application-services";

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
  const actions = useActions();
  const { dataChanges, recordMutations } = useApplicationServices();
  const [selectedRecordId, setSelectedRecordId] = createSignal<string>();
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

  createEffect(() => {
    const routedRecordId = controller.navigation.selectedRecordId();
    if (routedRecordId) setSelectedRecordId(routedRecordId);
  });
  createEffect(() => {
    const result = ticketRecords();
    if (!result) return;
    const unsubscribe = dataChanges.subscribe({ tableName: ticketEditor.tableName }, (change) => {
      const identity = result.column(ticketEditor.identityAttribute);
      const row = identity && result.rows.find((candidate) => candidate.value(identity) === change.recordId);
      if (!row) return;
      const updates = Object.entries(change.changes).flatMap(([attribute, value]) => {
        const column = result.column(attribute);
        return column ? [{ column, value }] : [];
      });
      if (updates.length) result.updateRow(row, updates);
    });
    onCleanup(unsubscribe);
  });
  createEffect(() => {
    const id = selectedRecordId();
    const identity = ticketRecords()?.column(ticketEditor.identityAttribute);
    if (id && identity && !records().some((row) => row.value(identity) === id)) setSelectedRecordId(undefined);
  });
  const actionTarget = (): EntityRecordActionTarget | undefined => {
    const result = ticketRecords();
    const recordId = selectedRecordId();
    const identity = result?.column(ticketEditor.identityAttribute);
    const row =
      identity && recordId ? result?.rows.find((candidate) => candidate.value(identity) === recordId) : undefined;
    if (!result || !recordId || !row) return undefined;
    const values = Object.freeze(
      Object.fromEntries(result.columns.map((column) => [column.attribute, row.value(column)!])),
    );
    return {
      type: "entity-record",
      entityId: ticketEntity.id,
      recordId,
      values,
      update: async (changes) => {
        const changed = Object.fromEntries(
          Object.entries(changes).filter(([attribute, value]) => values[attribute] !== value),
        );
        if (Object.keys(changed).length) await recordMutations.update(ticketEditor, recordId, changed);
      },
      activate: () => controller.selectRecord(recordId),
    };
  };
  onCleanup(actions.registerTarget(actionTarget));
  const selectTicket = (row: QueryResult["rows"][number]) => {
    const id = rowId(row, ticketRecords()?.column("id"));
    setSelectedRecordId(id);
    if (id && (controller.navigation.selectedRecordId() || controller.navigation.creatingRecord())) {
      controller.selectRecord(id);
    }
  };

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
        <button
          type="button"
          class={styles.secondary}
          disabled={!selectedRecordId()}
          onClick={() => selectedRecordId() && controller.selectRecord(selectedRecordId()!)}
        >
          Edit
        </button>
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
                          role="button"
                          aria-pressed={rowId(row, ticketRecords()?.column("id")) === selectedRecordId()}
                          onClick={() => selectTicket(row)}
                          onDblClick={() => openTicket(controller, row, ticketRecords()?.column("id"))}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              openTicket(controller, row, ticketRecords()?.column("id"));
                            } else if (event.key === " ") {
                              event.preventDefault();
                              selectTicket(row);
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
                  selectedRowKey={selectedRecordId()}
                  density={presentation()?.density}
                  onRowSelect={selectTicket}
                  onRowActivate={(row) => openTicket(controller, row, ticketRecords()?.column("id"))}
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

function rowId(row: QueryResult["rows"][number], idColumn: QueryColumnHandle | undefined): string | undefined {
  const id = idColumn ? row.value(idColumn) : undefined;
  return typeof id === "string" ? id : undefined;
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
