import { createEffect, createMemo, createResource, createSignal, Match, onCleanup, Show, Switch } from "solid-js";
import FunnelIcon from "lucide-solid/icons/funnel";
import XIcon from "lucide-solid/icons/x";

import { useNavigation } from "../../../base/navigation";
import { DataTable } from "../../../components/DataTable";
import { entityFilterAttributes } from "../../../components/filter-definition/entity-filter-attributes";
import { FilterDefinitionEditor } from "../../../components/filter-definition/FilterDefinitionEditor";
import { createCompositeFilter, type FilterDefinition } from "../../../components/filter-definition/filter-model";
import { IconButton } from "../../../components/IconButton";
import { useContextMenu } from "../../../components/context-menu/ContextMenuProvider";
import { contextMenuGroupId } from "../../../components/context-menu/context-menu";
import { useActions } from "../actions/ActionProvider";
import type { EntityRecordActionTarget } from "../actions/action";
import { actionsToContextMenuEntries } from "../actions/action-context-menu";
import { bindEntity, createEntityTableColumns } from "../entities/bound-entity";
import { createEntityEditorDefinition } from "../entities/entity-editor";
import type { EntityId } from "../entities/entity-description";
import { useEntityRegistry } from "../entities/entity-registry";
import { useLookupService } from "../lookups/lookup";
import type { QueryResultRow } from "../query/query-result";
import { loadEntityRecords } from "../saved-views/entity-query";
import { useApplicationServices } from "../../../base/services/application-services";
import { MasterDetailView } from "./MasterDetailView";
import styles from "./EntityMasterDetailView.module.css";

/** Generic create, filter, list, and edit view driven by one entity description. */
export function EntityMasterDetailView(props: {
  entityId: EntityId;
  initialFilter?: FilterDefinition;
  filterIdentity?: string;
}) {
  const navigation = useNavigation();
  const { dataChanges, fetchService, recordMutations } = useApplicationServices();
  const actions = useActions();
  const contextMenu = useContextMenu();
  const lookups = useLookupService();
  const description = useEntityRegistry().require(props.entityId);
  const editor = createEntityEditorDefinition(description);
  const [filterOpen, setFilterOpen] = createSignal(false);
  const [filter, setFilter] = createSignal<FilterDefinition>(cloneFilter(props.initialFilter));
  const [queryFilter, setQueryFilter] = createSignal<FilterDefinition>(filter());
  const [showLoading, setShowLoading] = createSignal(false);
  createEffect(() => {
    const current = filter();
    const timer = window.setTimeout(() => setQueryFilter(current), 300);
    onCleanup(() => window.clearTimeout(timer));
  });
  let activeFilterIdentity = props.filterIdentity;
  createEffect(() => {
    if (props.filterIdentity === activeFilterIdentity) return;
    activeFilterIdentity = props.filterIdentity;
    const next = cloneFilter(props.initialFilter);
    setFilter(next);
    setQueryFilter(next);
  });
  const [records, { refetch }] = createResource(queryFilter, (currentFilter) =>
    loadEntityRecords(description, fetchService, { filter: currentFilter }),
  );
  createEffect(() => {
    if (!records.loading) {
      setShowLoading(false);
      return;
    }
    const timer = window.setTimeout(() => setShowLoading(true), 200);
    onCleanup(() => window.clearTimeout(timer));
  });
  const unsubscribe = dataChanges.subscribe({ tableName: description.tableName }, (change) => {
    lookups.invalidateSource(description.tableName);
    const result = records();
    if (!result) return;
    const identity = result.column(description.identityAttribute);
    const row = identity && result.rows.find((candidate) => candidate.value(identity) === change.recordId);
    if (!row) return;
    const updates = Object.entries(change.changes).flatMap(([attribute, value]) => {
      const column = result.column(attribute);
      return column ? [{ column, value }] : [];
    });
    if (updates.length) result.updateRow(row, updates);
  });
  onCleanup(unsubscribe);

  const actionTarget = (): EntityRecordActionTarget | undefined => {
    const result = records();
    const recordId = navigation.selectedRecordId();
    const identity = result?.column(description.identityAttribute);
    const row =
      identity && recordId ? result?.rows.find((candidate) => candidate.value(identity) === recordId) : undefined;
    if (!result || !recordId || !row) return undefined;
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
        if (Object.keys(changed).length) await recordMutations.update(editor, recordId, changed);
      },
    };
  };
  onCleanup(actions.registerTarget(actionTarget));

  const openContextMenu = (event: MouseEvent, row: QueryResultRow) => {
    const result = records();
    const identity = result?.column(description.identityAttribute);
    const id = identity ? row.value(identity) : undefined;
    if (typeof id !== "string") return;
    navigation.selectRecord(id);
    contextMenu.open({
      event,
      createGroups: () => [
        {
          id: contextMenuGroupId("record-actions"),
          label: `${description.label} actions`,
          entries: actionsToContextMenuEntries(actions.availableActions(), {
            disabled: Boolean(actions.pendingAction()),
            execute: actions.execute,
          }),
        },
      ],
    });
  };

  return (
    <Switch>
      <Match when={records.error}>
        <p class={styles.error} role="alert">
          {records.error.message}
        </p>
      </Match>
      <Match when={records.loading && !records()}>
        <Show when={showLoading()}>
          <p class={styles.loading}>Loading {description.pluralLabel.toLowerCase()}...</p>
        </Show>
      </Match>
      <Match when={records()}>
        {(result) => {
          const entity = createMemo(() => bindEntity(result(), description));
          return (
            <MasterDetailView
              leadingPanel={
                filterOpen() ? (
                  <div aria-label={`Filter ${description.pluralLabel}`}>
                    <header class={styles.filterHeader}>
                      <h2>Filter {description.pluralLabel}</h2>
                      <IconButton
                        label="Close filter"
                        icon={<XIcon size={16} />}
                        onClick={() => setFilterOpen(false)}
                      />
                    </header>
                    <FilterDefinitionEditor
                      attributes={entityFilterAttributes(description)}
                      value={filter()}
                      onChange={setFilter}
                      ariaLabel={`Filter ${description.pluralLabel}`}
                    />
                  </div>
                ) : undefined
              }
              master={
                <>
                  <div class={styles.toolbar}>
                    <IconButton
                      label={filterOpen() ? "Close filter" : `Filter ${description.pluralLabel.toLowerCase()}`}
                      icon={<FunnelIcon size={17} />}
                      aria-expanded={filterOpen()}
                      class={`${styles.filterButton} ${filterOpen() ? styles.activeFilter : ""}`}
                      onClick={() => setFilterOpen((open) => !open)}
                    />
                    <Show when={showLoading()}>
                      <span class={styles.queryLoading} role="status">
                        <span class={styles.spinner} aria-hidden="true" />
                        Loading...
                      </span>
                    </Show>
                    <IconButton
                      label={`New ${description.label.toLowerCase()}`}
                      icon="+"
                      class={styles.createButton}
                      onClick={() => navigation.createRecord()}
                    />
                  </div>
                  <DataTable
                    ariaLabel={description.pluralLabel}
                    result={result()}
                    rows={result().rows}
                    columns={createEntityTableColumns(entity())}
                    rowKey={entity().identity}
                    selectedRowKey={navigation.selectedRecordId()}
                    density="compact"
                    emptyMessage={`No matching ${description.pluralLabel.toLowerCase()} found.`}
                    onRowSelect={(row) => {
                      const id = row.value(entity().identity);
                      if (typeof id === "string") navigation.selectRecord(id);
                    }}
                    onRowContextMenu={openContextMenu}
                  />
                </>
              }
              definition={editor}
              fetchService={fetchService}
              result={result()}
              selectedRecordId={navigation.selectedRecordId()}
              creating={navigation.creatingRecord()}
              onCreated={async (id) => {
                const refreshed = await refetch();
                const identity = refreshed?.column(description.identityAttribute);
                if (identity && refreshed?.rows.some((row) => row.value(identity) === id)) {
                  navigation.finishCreatingRecord(id);
                } else {
                  navigation.closeRecord();
                }
              }}
              onClose={() => navigation.closeRecord()}
            />
          );
        }}
      </Match>
    </Switch>
  );
}

function cloneFilter(filter: FilterDefinition | undefined): FilterDefinition {
  if (!filter) return createCompositeFilter();
  if (filter.type === "composite") {
    return { ...filter, children: filter.children.map(cloneFilter) };
  }
  return {
    ...filter,
    operand: filter.operand
      ? filter.operand.type === "set"
        ? { ...filter.operand, values: [...filter.operand.values] }
        : { ...filter.operand }
      : undefined,
  };
}
