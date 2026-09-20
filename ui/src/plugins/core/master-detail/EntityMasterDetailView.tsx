import FunnelIcon from "lucide-solid/icons/funnel";
import GemIcon from "lucide-solid/icons/gem";
import RefreshCwIcon from "lucide-solid/icons/refresh-cw";
import XIcon from "lucide-solid/icons/x";
import { createEffect, createMemo, createResource, createSignal, Match, onCleanup, Show, Switch } from "solid-js";

import { useNavigation } from "../../../base/navigation";
import { useApplicationServices } from "../../../base/services/application-services";
import { useContextMenu } from "../../../components/context-menu/ContextMenuProvider";
import { contextMenuGroupId } from "../../../components/context-menu/context-menu";
import { DataTable, type DataTableSort } from "../../../components/DataTable";
import { type Facet, FacetFilter, type FacetValueState } from "../../../components/facet/FacetFilter";
import { entityFilterAttributes } from "../../../components/filter-definition/entity-filter-attributes";
import { FilterDefinitionEditor } from "../../../components/filter-definition/FilterDefinitionEditor";
import { createCompositeFilter, type FilterDefinition } from "../../../components/filter-definition/filter-model";
import { IconButton } from "../../../components/IconButton";
import { Select } from "../../../components/Select";
import { deriveColumnHighlights } from "../../../components/text-highlight";
import { useActions } from "../actions/ActionProvider";
import type { EntityRecordActionTarget } from "../actions/action";
import { actionsToContextMenuEntries } from "../actions/action-context-menu";
import { bindEntity, createEntityTableColumns } from "../entities/bound-entity";
import type { EntityDescription, EntityId } from "../entities/entity-description";
import { createEntityEditorDefinition } from "../entities/entity-editor";
import { useEntityRegistry } from "../entities/entity-registry";
import { LookupValue, useLookupService } from "../lookups/lookup";
import {
  emptyResultFor,
  type QueryAggregateResult,
  type QueryResult,
  type QueryResultRow,
  type QueryValue,
} from "../query/query-result";
import {
  type FacetSelection,
  loadEntityFacet,
  loadEntityRecordCount,
  loadEntityRecords,
} from "../saved-views/entity-query";
import styles from "./EntityMasterDetailView.module.css";
import { MasterDetailView } from "./MasterDetailView";
import { recordTablePerformance } from "./table-performance";

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
  // The master table always renders while the first page loads, so the
  // viewport can be measured before records arrive. It is fed an empty
  // result with the same columns: binding succeeds and the headers match,
  // only the body is empty instead of carrying placeholder rows.
  const emptyResult = emptyResultFor(
    description.attributes.map((attribute) => ({ attribute: attribute.id, type: attribute.valueType })),
  );
  const [filterOpen, setFilterOpen] = createSignal(false);
  const [facetsOpen, setFacetsOpen] = createSignal(false);
  const [visibleFacetIds, setVisibleFacetIds] = createSignal<readonly string[]>(
    description.attributes.filter((attribute) => attribute.facet).map((attribute) => attribute.id),
  );
  const [filter, setFilter] = createSignal<FilterDefinition>(cloneFilter(props.initialFilter));
  const [sorting, setSorting] = createSignal<readonly DataTableSort[]>(cloneSorting(props.initialSorting));
  const [facetSelections, setFacetSelections] = createSignal<readonly FacetSelection[]>([]);
  const [search, setSearch] = createSignal("");
  // Quicksearch fans out to every attribute; column rendering decides what
  // can show marks (text and numbers highlight, lookup labels highlight
  // matched words, other custom cells stay untouched).
  const searchAttributes = createMemo(() => description.attributes.map((attribute) => attribute.id));
  // Per-column quick filters keyed by attribute, trimmed on commit.
  const [columnSearch, setColumnSearch] = createSignal<Readonly<Record<string, string>>>({});
  const [filterParameters, setFilterParameters] = createSignal({
    filter: filter(),
    facets: facetSelections(),
    search: search(),
    columnSearch: columnSearch(),
  });
  const rowParameters = createMemo(() => ({ ...filterParameters(), sorting: sorting() }));
  // Highlights derive from the same committed parameters as the queries so
  // marks can never skew from the executed filter and search.
  const highlights = createMemo(() => {
    const parameters = filterParameters();
    return deriveColumnHighlights(parameters.filter, parameters.search, searchAttributes(), parameters.columnSearch);
  });
  // Lookup columns resolve ids to labels with no searchable text of their
  // own, so they offer no column input.
  const columnFilters = createMemo(() => {
    const live = columnSearch();
    return new Map(
      description.attributes
        .filter((attribute) => !attribute.lookup)
        .map((attribute) => [
          attribute.id,
          {
            value: live[attribute.id] ?? "",
            placeholder: `Filter ${attribute.label}`,
            onInput: (value: string) => setColumnSearch((current) => ({ ...current, [attribute.id]: value })),
          },
        ]),
    );
  });
  const [showLoading, setShowLoading] = createSignal(false);
  // Viewport height drives table virtualization so only visible rows mount.
  // It is measured rather than fixed because the master pane flex-fills
  // the available shell space. The table renders from the first paint with
  // an empty body while the first page loads, so the viewport is measured
  // during the fetch and the first data paint is already virtualized.
  const [viewportHeight, setViewportHeight] = createSignal(0);
  const observeViewportHeight = (element: HTMLDivElement) => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      setViewportHeight(entries[0]?.contentRect.height ?? 0);
    });
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  };
  // Live inputs commit into the executed query parameters on a trailing
  // debounce so typing never fires a request per keystroke.
  debounceParameter(
    filter,
    () => filterParameters().filter,
    (value) => setFilterParameters((parameters) => ({ ...parameters, filter: value })),
  );
  debounceParameter(
    () => search().trim(),
    () => filterParameters().search,
    (value) => setFilterParameters((parameters) => ({ ...parameters, search: value })),
  );
  debounceParameter(
    () => trimColumnSearch(columnSearch()),
    () => filterParameters().columnSearch,
    (value) => setFilterParameters((parameters) => ({ ...parameters, columnSearch: value })),
    sameColumnSearch,
  );
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
    setSearch("");
    setColumnSearch({});
    setFilterParameters({ filter: next, facets: [], search: "", columnSearch: {} });
  });
  let pendingFetch: { fetchMs: number; settledAt: number; rowCount: number; columnCount: number } | undefined;
  const [records, { refetch }] = createResource(rowParameters, async (query) => {
    const started = performance.now();
    const result = await loadEntityRecords(description, fetchService, query);
    const settledAt = performance.now();
    pendingFetch = {
      fetchMs: settledAt - started,
      settledAt,
      rowCount: result.rows.length,
      columnCount: result.columns.length,
    };
    return result;
  });
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
  // Derivation cost is timed into a plain local so rendering stays pure;
  // the publish effect below reads it after the memo settles. Binding runs
  // against the empty result while the first page loads so the table can
  // render its shell from the first paint.
  let lastProcessMs = 0;
  const boundEntity = createMemo(() => {
    const loaded = records();
    const result = loaded ?? emptyResult;
    const started = performance.now();
    const bound = bindEntity(result, description);
    if (loaded) lastProcessMs = performance.now() - started;
    return bound;
  });
  const entity = () => boundEntity();
  createEffect(() => {
    const result = displayedRecords();
    const fetch = pendingFetch;
    const bound = boundEntity();
    if (!result || !fetch || !bound) return;
    const processMs = lastProcessMs;
    const paintStarted = performance.now();
    const publish = () =>
      recordTablePerformance({
        entityId: description.id,
        entityLabel: description.label,
        tableName: description.tableName,
        fetchMs: fetch.fetchMs,
        processMs,
        commitMs: paintStarted - fetch.settledAt,
        displayMs: performance.now() - paintStarted,
        virtualized: viewportHeight() > 0,
        rowCount: fetch.rowCount,
        totalCount: result.numberOfHits ?? fetch.rowCount,
        columnCount: fetch.columnCount,
        measuredAt: Date.now(),
      });
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(publish);
    else publish();
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
      <Match when={records() || records.loading}>
        <MasterDetailView
          leadingPanel={
            filterOpen() ? (
              <div class={styles.filterPanel} aria-label={`Filter ${description.pluralLabel}`}>
                <header class={styles.filterHeader}>
                  <h2 class={styles.panelTitle}>
                    <FunnelIcon size={15} />
                    Filter {description.pluralLabel}
                  </h2>
                  <IconButton label="Close filter" icon={<XIcon size={16} />} onClick={() => setFilterOpen(false)} />
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
                  <IconButton label="Close facets" icon={<XIcon size={16} />} onClick={() => setFacetsOpen(false)} />
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
                        .filter((attribute) => !normalized || attribute.label.toLocaleLowerCase().includes(normalized))
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
                <label class={styles.searchField}>
                  <span class={styles.searchIcon} aria-hidden="true">
                    ⌕
                  </span>
                  <span class={styles.srOnly}>Search {description.pluralLabel.toLowerCase()}</span>
                  <input
                    type="search"
                    value={search()}
                    onInput={(event) => setSearch(event.currentTarget.value)}
                    placeholder={`Search ${description.pluralLabel.toLowerCase()}`}
                    aria-label={`Search ${description.pluralLabel.toLowerCase()}`}
                  />
                </label>
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
              <div ref={observeViewportHeight} class={styles.tableViewport}>
                <DataTable
                  ariaLabel={description.pluralLabel}
                  result={displayedRecords() ?? emptyResult}
                  rows={records()?.rows}
                  columns={createEntityTableColumns(entity())}
                  highlights={highlights()}
                  columnFilters={columnFilters()}
                  loading={showLoading() || (records.loading && !records())}
                  loadingMessage="Loading..."
                  fillHeight
                  fillWidth
                  virtualization={viewportHeight() > 0 ? { height: viewportHeight() } : undefined}
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
              </div>
            </>
          }
          definition={editor}
          fetchService={fetchService}
          result={records()}
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

/** Commits a live input into the executed query on a trailing debounce. */
function debounceParameter<T>(
  value: () => T,
  committed: () => T,
  commit: (value: T) => void,
  equal: (left: T, right: T) => boolean = Object.is,
): void {
  createEffect(() => {
    const current = value();
    if (equal(current, committed())) return;
    const timer = window.setTimeout(() => commit(current), 300);
    onCleanup(() => window.clearTimeout(timer));
  });
}

function trimColumnSearch(search: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const trimmed = Object.fromEntries(
    Object.entries(search)
      .map(([attribute, term]) => [attribute, term.trim()] as const)
      .filter(([, term]) => term),
  );
  return trimmed;
}

function sameColumnSearch(left: Readonly<Record<string, string>>, right: Readonly<Record<string, string>>): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
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
