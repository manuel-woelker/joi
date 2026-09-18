import { createEffect, createMemo, createResource, createSignal, Match, onCleanup, Show, Switch } from "solid-js";
import FunnelIcon from "lucide-solid/icons/funnel";
import GemIcon from "lucide-solid/icons/gem";
import RefreshCwIcon from "lucide-solid/icons/refresh-cw";
import XIcon from "lucide-solid/icons/x";

import { useNavigation } from "../../../base/navigation";
import { DataTable, type DataTableSort } from "../../../components/DataTable";
import { FacetFilter, type Facet, type FacetValueState } from "../../../components/facet/FacetFilter";
import { entityFilterAttributes } from "../../../components/filter-definition/entity-filter-attributes";
import { FilterDefinitionEditor } from "../../../components/filter-definition/FilterDefinitionEditor";
import { createCompositeFilter, type FilterDefinition } from "../../../components/filter-definition/filter-model";
import { IconButton } from "../../../components/IconButton";
import { Select } from "../../../components/Select";
import { useContextMenu } from "../../../components/context-menu/ContextMenuProvider";
import { contextMenuGroupId } from "../../../components/context-menu/context-menu";
import { useActions } from "../actions/ActionProvider";
import type { EntityRecordActionTarget } from "../actions/action";
import { actionsToContextMenuEntries } from "../actions/action-context-menu";
import { bindEntity, createEntityTableColumns } from "../entities/bound-entity";
import { createEntityEditorDefinition } from "../entities/entity-editor";
import type { EntityDescription, EntityId } from "../entities/entity-description";
import { useEntityRegistry } from "../entities/entity-registry";
import { LookupValue, useLookupService } from "../lookups/lookup";
import type { QueryAggregateResult, QueryResult, QueryResultRow, QueryValue } from "../query/query-result";
import {
  loadEntityFacet,
  loadEntityRecordCount,
  loadEntityRecords,
  type FacetSelection,
} from "../saved-views/entity-query";
import { useApplicationServices } from "../../../base/services/application-services";
import { MasterDetailView } from "./MasterDetailView";
import styles from "./EntityMasterDetailView.module.css";

/** Generic create, filter, list, and edit view driven by one entity description. */
export function EntityMasterDetailView(props: {
  entityId: EntityId;
  initialFilter?: FilterDefinition;
  initialSorting?: readonly DataTableSort[];
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
  const [facetsOpen, setFacetsOpen] = createSignal(false);
  const [visibleFacetIds, setVisibleFacetIds] = createSignal<readonly string[]>(
    description.attributes.filter((attribute) => attribute.facet).map((attribute) => attribute.id),
  );
  const [filter, setFilter] = createSignal<FilterDefinition>(cloneFilter(props.initialFilter));
  const [sorting, setSorting] = createSignal<readonly DataTableSort[]>(cloneSorting(props.initialSorting));
  const [facetSelections, setFacetSelections] = createSignal<readonly FacetSelection[]>([]);
  const [filterParameters, setFilterParameters] = createSignal({
    filter: filter(),
    facets: facetSelections(),
  });
  const rowParameters = createMemo(() => ({ ...filterParameters(), sorting: sorting() }));
  const [showLoading, setShowLoading] = createSignal(false);
  createEffect(() => {
    const current = filter();
    if (current === filterParameters().filter) return;
    const timer = window.setTimeout(
      () => setFilterParameters((parameters) => ({ ...parameters, filter: current })),
      300,
    );
    onCleanup(() => window.clearTimeout(timer));
  });
  createEffect(() => {
    const current = facetSelections();
    if (current === filterParameters().facets) return;
    setFilterParameters((parameters) => ({ ...parameters, facets: current }));
  });
  let activeFilterIdentity = props.filterIdentity;
  createEffect(() => {
    if (props.filterIdentity === activeFilterIdentity) return;
    activeFilterIdentity = props.filterIdentity;
    const next = cloneFilter(props.initialFilter);
    const nextSorting = cloneSorting(props.initialSorting);
    setFilter(next);
    setSorting(nextSorting);
    setFacetSelections([]);
    setFilterParameters({ filter: next, facets: [] });
  });
  const [records, { refetch }] = createResource(rowParameters, (query) =>
    loadEntityRecords(description, fetchService, query),
  );
  createEffect(() => {
    const result = records();
    const recordId = navigation.selectedRecordId();
    if (!result || !recordId) return;
    const identity = result.column(description.identityAttribute);
    if (identity && !result.rows.some((row) => row.value(identity) === recordId)) {
      navigation.closeRecord();
    }
  });
  const [totalCount, { refetch: refetchTotalCount }] = createResource(filterParameters, (query) =>
    loadEntityRecordCount(description, fetchService, query),
  );
  const facetResources = description.attributes
    .filter((attribute) => attribute.facet)
    .map((attribute) => {
      const [result, controls] = createResource(filterParameters, (query) =>
        loadEntityFacet(description, attribute.id, fetchService, query),
      );
      return { attribute: attribute.id, result, refetch: controls.refetch };
    });
  const displayedRecords = createMemo<QueryResult | undefined>(() => {
    const result = records();
    const count = totalCount();
    return result && count !== undefined ? { ...result, numberOfHits: count } : result;
  });
  createEffect(() => {
    const loading = records.loading || totalCount.loading || facetResources.some((resource) => resource.result.loading);
    if (!loading) {
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

  const aggregateResults = () =>
    new Map(facetResources.map((resource) => [resource.attribute, resource.result()] as const));
  const facets = createMemo(() => entityFacets(aggregateResults(), description, facetSelections()));
  const visibleFacets = createMemo(() => facets().filter((facet) => visibleFacetIds().includes(facet.id)));
  const availableFacets = createMemo(() =>
    description.attributes.filter((attribute) => attribute.facet && !visibleFacetIds().includes(attribute.id)),
  );
  const availableFacetKey = createMemo(() =>
    availableFacets()
      .map((attribute) => attribute.id)
      .join(","),
  );
  const changeFacet = (facetId: string, valueKey: string, state: FacetValueState) => {
    const value = facetValue(aggregateResults(), facetId, valueKey, facetSelections());
    if (value === undefined) return;
    setFacetSelections((current) => {
      const remaining = current.filter(
        (selection) => selection.attribute !== facetId || facetValueKey(selection.value) !== valueKey,
      );
      return state === "neutral" ? remaining : [...remaining, { attribute: facetId, value, state }];
    });
  };

  const refresh = () => {
    void refetch();
    void refetchTotalCount();
    for (const resource of facetResources) void resource.refetch();
  };

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
                  <div class={styles.filterPanel} aria-label={`Filter ${description.pluralLabel}`}>
                    <header class={styles.filterHeader}>
                      <h2 class={styles.panelTitle}>
                        <FunnelIcon size={15} />
                        Filter {description.pluralLabel}
                      </h2>
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
                ) : facetsOpen() ? (
                  <div class={styles.filterPanel} aria-label={`${description.pluralLabel} facets`}>
                    <header class={styles.filterHeader}>
                      <h2 class={styles.panelTitle}>
                        <GemIcon size={15} />
                        {description.pluralLabel} facets
                      </h2>
                      <IconButton
                        label="Close facets"
                        icon={<XIcon size={16} />}
                        onClick={() => setFacetsOpen(false)}
                      />
                    </header>
                    <Show
                      keyed
                      when={availableFacetKey()}
                      fallback={<p class={styles.noFacets}>All available facets are shown.</p>}
                    >
                      <Select
                        ariaLabel="Add facet"
                        value=""
                        placeholder="Add facet..."
                        density="compact"
                        loadEntries={async (query) => {
                          const normalized = query.trim().toLocaleLowerCase();
                          const entries = availableFacets()
                            .filter(
                              (attribute) => !normalized || attribute.label.toLocaleLowerCase().includes(normalized),
                            )
                            .map((attribute) => ({ id: attribute.id, label: attribute.label }));
                          return { entries, total: entries.length };
                        }}
                        entryId={(entry) => entry.id}
                        entryText={(entry) => entry.label}
                        onChange={(id) => {
                          if (!id) return;
                          setVisibleFacetIds((current) => [...current, id]);
                        }}
                      />
                    </Show>
                    <Show when={visibleFacets().length}>
                      <FacetFilter
                        class={styles.facets}
                        facets={visibleFacets()}
                        onValueChange={changeFacet}
                        onRemoveFacet={(id) => setVisibleFacetIds((current) => current.filter((value) => value !== id))}
                        renderValue={(facet, value) => {
                          const attribute = description.attributes.find((candidate) => candidate.id === facet.id);
                          const raw = facetValue(aggregateResults(), facet.id, value.value, facetSelections());
                          return attribute?.lookup && typeof raw === "string" && raw ? (
                            <LookupValue lookup={attribute.lookup} value={raw} />
                          ) : (
                            value.label
                          );
                        }}
                      />
                    </Show>
                    <Show when={!visibleFacets().length && availableFacetKey()}>
                      <p class={styles.noFacets}>Select a facet from the dropdown above.</p>
                    </Show>
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
                      onClick={() => {
                        setFilterOpen((open) => !open);
                        setFacetsOpen(false);
                      }}
                    />
                    <IconButton
                      label={facetsOpen() ? "Close facets" : `Show ${description.pluralLabel.toLowerCase()} facets`}
                      icon={<GemIcon size={17} />}
                      aria-expanded={facetsOpen()}
                      class={`${styles.facetButton} ${facetsOpen() ? styles.activeFilter : ""}`}
                      onClick={() => {
                        setFacetsOpen((open) => !open);
                        setFilterOpen(false);
                      }}
                    />
                    <IconButton
                      label={`New ${description.label.toLowerCase()}`}
                      icon="+"
                      class={styles.createButton}
                      onClick={() => navigation.createRecord()}
                    />
                    <IconButton
                      label={`Refresh ${description.pluralLabel.toLowerCase()}`}
                      icon={<RefreshCwIcon size={17} />}
                      class={styles.refreshButton}
                      onClick={refresh}
                    />
                  </div>
                  <DataTable
                    ariaLabel={description.pluralLabel}
                    result={displayedRecords()!}
                    rows={result().rows}
                    columns={createEntityTableColumns(entity())}
                    loading={showLoading()}
                    loadingMessage="Loading..."
                    fillHeight
                    fillWidth
                    sorting={sorting()}
                    onSortingChange={setSorting}
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
                void refetchTotalCount();
                for (const resource of facetResources) void resource.refetch();
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

function entityFacets(
  aggregates: ReadonlyMap<string, QueryAggregateResult | undefined>,
  description: EntityDescription,
  selections: readonly FacetSelection[],
): readonly Facet[] {
  return description.attributes.flatMap((attribute) => {
    if (!attribute.facet) return [];
    const aggregate = aggregates.get(attribute.id);
    const values = new Map(
      (aggregate?.values ?? []).map((entry) => [
        facetValueKey(entry.value),
        {
          value: facetValueKey(entry.value),
          label: entry.value === null ? "Unassigned" : String(entry.value),
          count: entry.count,
          state: "neutral" as FacetValueState,
        },
      ]),
    );
    for (const selection of selections.filter((candidate) => candidate.attribute === attribute.id)) {
      const key = facetValueKey(selection.value);
      values.set(key, {
        value: key,
        label: selection.value === null ? "Unassigned" : String(selection.value),
        count: values.get(key)?.count ?? 0,
        state: selection.state,
      });
    }
    return [
      { id: attribute.id, label: attribute.label, description: attribute.description, values: [...values.values()] },
    ];
  });
}

function facetValue(
  aggregates: ReadonlyMap<string, QueryAggregateResult | undefined>,
  attribute: string,
  key: string,
  selections: readonly FacetSelection[],
): QueryValue | null | undefined {
  const selected = selections.find(
    (selection) => selection.attribute === attribute && facetValueKey(selection.value) === key,
  );
  if (selected) return selected.value;
  return aggregates.get(attribute)?.values.find((entry) => facetValueKey(entry.value) === key)?.value;
}

function facetValueKey(value: QueryValue | null): string {
  return value === null ? "null:" : `${typeof value}:${value}`;
}

function cloneSorting(sorting: readonly DataTableSort[] | undefined): readonly DataTableSort[] {
  return sorting?.map((sort) => ({ ...sort })) ?? [];
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
