import { createEffect, createMemo, createResource, createSignal, For, onCleanup, Show } from "solid-js";

import { fetchService } from "../../../base/services/fetch-service";
import { DataTable } from "../../../components/DataTable";
import { IconButton } from "../../../components/IconButton";
import { QuickFilterInput } from "../../../components/QuickFilterInput";
import { useContextMenu } from "../../../components/context-menu/ContextMenuProvider";
import { contextMenuGroupId } from "../../../components/context-menu/context-menu";
import styles from "../../../components/ViewContent.module.css";
import { useActions } from "../actions/ActionProvider";
import type { EntityRecordActionTarget } from "../actions/action";
import { actionsToContextMenuEntries } from "../actions/action-context-menu";
import { bindEntity, createEntityTableColumns } from "../entities/bound-entity";
import { createEntityEditorDefinition } from "../entities/entity-editor";
import { useEntityRegistry } from "../entities/entity-registry";
import { MasterDetailView } from "../master-detail/MasterDetailView";
import type { QueryColumnHandle, QueryResult } from "../query/query-result";
import { useApplicationServices } from "../../../base/services/application-services";
import { loadEntityRecords } from "./entity-query";
import { useWorkspace } from "./controller";
import { executeQuery, validatePresentation } from "./query";

export function SavedViewCommands() {
  const controller = useWorkspace();
  const entities = useEntityRegistry();
  const query = () => {
    const view = controller.selectedView();
    return view ? controller.workspace.queries[view.queryId] : undefined;
  };
  const entity = () => {
    const current = query();
    return current ? entities.require(current.entityId) : undefined;
  };
  return (
    <>
      <IconButton label={`New ${entity()?.label ?? "record"}`} icon="+" onClick={() => controller.createRecord()} />
      <IconButton label="Configure view" icon="⚙" onClick={() => controller.setEditorOpen(true)} />
    </>
  );
}

export function SavedViewContent() {
  const controller = useWorkspace();
  const entities = useEntityRegistry();
  const actions = useActions();
  const contextMenu = useContextMenu();
  const { dataChanges, recordMutations } = useApplicationServices();
  const [selectedRecordId, setSelectedRecordId] = createSignal<string>();
  const query = () => {
    const view = controller.selectedView();
    return view ? controller.workspace.queries[view.queryId] : undefined;
  };
  const entity = createMemo(() => {
    const current = query();
    return current ? entities.require(current.entityId) : undefined;
  });
  const source = createMemo(() => {
    const currentQuery = query();
    const currentEntity = entity();
    return currentQuery && currentEntity ? { query: currentQuery, entity: currentEntity } : undefined;
  });
  const [queryResult, { refetch }] = createResource(source, ({ query: currentQuery, entity: currentEntity }) =>
    loadEntityRecords(currentEntity, fetchService, currentQuery),
  );
  const presentation = () => {
    const view = controller.selectedView();
    return view ? controller.workspace.presentations[view.presentationId] : undefined;
  };
  const editor = createMemo(() => {
    const current = entity();
    return current ? createEntityEditorDefinition(current) : undefined;
  });
  const records = createMemo(() => {
    const result = queryResult();
    const currentQuery = query();
    return result && currentQuery ? executeQuery(result, currentQuery, controller.search()) : [];
  });
  const boundEntity = createMemo(() => {
    const result = queryResult();
    const description = entity();
    return result && description ? bindEntity(result, description) : undefined;
  });
  const tableColumns = createMemo(() => {
    const bound = boundEntity();
    return bound
      ? createEntityTableColumns(
          bound,
          (presentation()?.fields ?? []).map((field) => ({
            attribute: field.field,
            label: field.label,
            width: field.width,
          })),
        )
      : [];
  });
  const validation = () => {
    const currentQuery = query();
    const currentPresentation = presentation();
    const currentEntity = entity();
    return currentQuery && currentPresentation && currentEntity
      ? validatePresentation(currentQuery, currentPresentation, currentEntity)
      : "View configuration is incomplete.";
  };

  createEffect(() => {
    const routedRecordId = controller.navigation.selectedRecordId();
    if (routedRecordId) setSelectedRecordId(routedRecordId);
  });
  createEffect(() => {
    const result = queryResult();
    const currentEditor = editor();
    if (!result || !currentEditor) return;
    const unsubscribe = dataChanges.subscribe({ tableName: currentEditor.tableName }, (change) => {
      const identity = result.column(currentEditor.identityAttribute);
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
    const result = queryResult();
    const currentEditor = editor();
    const identity = currentEditor ? result?.column(currentEditor.identityAttribute) : undefined;
    if (id && result && identity && !result.rows.some((row) => row.value(identity) === id)) {
      setSelectedRecordId(undefined);
      if (controller.navigation.selectedRecordId() === id) controller.navigation.closeRecord();
    }
  });

  const actionTarget = (): EntityRecordActionTarget | undefined => {
    const result = queryResult();
    const description = entity();
    const currentEditor = editor();
    const recordId = selectedRecordId();
    const identity = currentEditor ? result?.column(currentEditor.identityAttribute) : undefined;
    const row =
      identity && recordId ? result?.rows.find((candidate) => candidate.value(identity) === recordId) : undefined;
    if (!result || !description || !currentEditor || !recordId || !row) return undefined;
    const values = Object.freeze(
      Object.fromEntries(result.columns.map((column) => [column.attribute, row.value(column)!])),
    );
    return {
      type: "entity-record",
      entityId: description.id,
      recordId,
      values,
      update: async (changes) => {
        const changed = Object.fromEntries(
          Object.entries(changes).filter(([attribute, value]) => values[attribute] !== value),
        );
        if (Object.keys(changed).length) await recordMutations.update(currentEditor, recordId, changed);
      },
      activate: () => controller.selectRecord(recordId),
    };
  };
  onCleanup(actions.registerTarget(actionTarget));

  const selectRecord = (row: QueryResult["rows"][number]) => {
    const id = rowId(row, boundEntity()?.identity);
    setSelectedRecordId(id);
    if (id && (controller.navigation.selectedRecordId() || controller.navigation.creatingRecord())) {
      controller.selectRecord(id);
    }
  };
  const openContextMenu = (event: MouseEvent, row: QueryResult["rows"][number]) => {
    selectRecord(row);
    contextMenu.open({
      event,
      createGroups: () => [
        {
          id: contextMenuGroupId("record-actions"),
          label: `${entity()?.label ?? "Record"} actions`,
          entries: actionsToContextMenuEntries(actions.availableActions(), {
            disabled: Boolean(actions.pendingAction()),
            execute: actions.execute,
          }),
        },
      ],
    });
  };

  const master = (
    <>
      <div class={styles.viewToolbar}>
        <QuickFilterInput
          class={styles.searchField}
          leadingIcon="⌕"
          value={controller.search}
          onInput={controller.setSearch}
          placeholder="Search this view"
          ariaLabel="Search records"
        />
        <span class={styles.resultCount}>
          {queryResult.loading ? "Loading" : resultCount(queryResult(), records().length, entity()?.pluralLabel)}
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
          when={!queryResult.loading}
          fallback={
            <div class={`${styles.emptyState} ${styles.compact}`}>
              <h2>Loading records</h2>
            </div>
          }
        >
          <Show
            when={!queryResult.error}
            fallback={
              <div class={styles.errorState}>
                <p>{entity()?.pluralLabel ?? "Records"} could not be loaded.</p>
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
                  <h2>No matching records</h2>
                  <p>Adjust the search or view query.</p>
                </div>
              }
            >
              <Show
                when={presentation()?.layout === "list"}
                fallback={
                  <DataTable
                    ariaLabel={controller.selectedView()?.name ?? entity()?.pluralLabel ?? "Records"}
                    result={queryResult()!}
                    rows={records()}
                    columns={tableColumns()}
                    rowKey={boundEntity()?.identity}
                    selectedRowKey={selectedRecordId()}
                    density={presentation()?.density}
                    onRowSelect={selectRecord}
                    onRowActivate={(row) => openRecord(controller, row, boundEntity()?.identity)}
                    onRowContextMenu={openContextMenu}
                  />
                }
              >
                <div class={styles.issueList} role="list">
                  <For each={records()}>
                    {(row) => (
                      <article
                        role="listitem"
                        tabIndex={0}
                        onClick={() => selectRecord(row)}
                        onDblClick={() => openRecord(controller, row, boundEntity()?.identity)}
                        onContextMenu={(event) => openContextMenu(event, row)}
                      >
                        <For each={presentation()?.fields}>
                          {(field, index) => {
                            const value = () => row.value(queryResult()!.requireColumn(field.field));
                            return index() === 0 ? <strong>{value()}</strong> : <span>{value()}</span>;
                          }}
                        </For>
                      </article>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </Show>
        </Show>
      </Show>
    </>
  );
  return (
    <Show when={editor()}>
      {(currentEditor) => (
        <MasterDetailView
          master={master}
          definition={currentEditor()}
          fetchService={fetchService}
          result={queryResult()}
          selectedRecordId={controller.navigation.selectedRecordId()}
          creating={controller.navigation.creatingRecord()}
          onCreated={async (id) => {
            const refreshed = await refetch();
            if (hasRecord(refreshed, id, currentEditor().identityAttribute)) controller.finishCreatingRecord(id);
            else {
              controller.closeRecord();
              controller.announce(`${entity()?.label ?? "Record"} created outside the current view.`);
            }
          }}
          onClose={() => controller.closeRecord()}
        />
      )}
    </Show>
  );
}

function rowId(row: QueryResult["rows"][number], idColumn: QueryColumnHandle | undefined): string | undefined {
  const id = idColumn ? row.value(idColumn) : undefined;
  return typeof id === "string" ? id : undefined;
}

function hasRecord(result: QueryResult | null | undefined, id: string, identityAttribute: string): boolean {
  const identity = result?.column(identityAttribute);
  return Boolean(identity && result?.rows.some((row) => row.value(identity) === id));
}

function openRecord(
  controller: ReturnType<typeof useWorkspace>,
  row: QueryResult["rows"][number],
  idColumn: QueryColumnHandle | undefined,
) {
  const id = idColumn ? row.value(idColumn) : undefined;
  if (typeof id === "string") controller.selectRecord(id);
}

function resultCount(result: QueryResult | undefined, visibleRows: number, pluralLabel = "records"): string {
  if (!result) return `0 ${pluralLabel.toLocaleLowerCase()}`;
  const label = pluralLabel.toLocaleLowerCase();
  if (result.numberOfHits === undefined) return `${visibleRows} ${label}`;
  return visibleRows === result.numberOfHits
    ? `${result.numberOfHits} ${label}`
    : `${visibleRows} of ${result.numberOfHits} ${label}`;
}
