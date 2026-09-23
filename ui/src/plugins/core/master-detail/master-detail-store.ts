import { batch, createEffect, createMemo, createResource, createSignal, onCleanup, type Accessor } from "solid-js";
import type { NavigationController } from "../../../base/navigation";
import type { ApplicationServices } from "../../../base/services/application-services";
import type { useActions } from "../actions/ActionProvider";
import type { LookupService } from "../lookups/lookup";
import { lookupEntryId } from "../lookups/lookup";
import type { DataTableSort } from "../../../components/DataTable";
import type { Facet, FacetValueState } from "../../../components/facet/FacetFilter";
import { entityFilterAttributes } from "../../../components/filter-definition/entity-filter-attributes";
import { createCompositeFilter, type FilterDefinition } from "../../../components/filter-definition/filter-model";
import { hasAttributeFilter, removeAttributeFilters } from "../../../components/filter-definition/filter-operations";
import { deriveColumnHighlights } from "../../../components/text-highlight";
import type { EntityRecordActionTarget } from "../actions/action";
import { actionsToContextMenuEntries } from "../actions/action-context-menu";
import { contextMenuEntryId, contextMenuGroupId } from "../../../components/context-menu/context-menu";
import { bindEntity } from "../entities/bound-entity";
import type { EntityDescription } from "../entities/entity-description";
import { createEntityEditorDefinition } from "../entities/entity-editor";
import {
  emptyResultFor,
  type QueryAggregateResult,
  type QueryResult,
  type QueryResultRow,
  type QueryValue,
} from "../query/query-result";
import {
  type FacetSelection,
  filteredEntityAttributes,
  loadEntityFacet,
  loadEntityRecordCount,
  loadEntityRecords,
} from "../saved-views/entity-query";
import { recordTablePerformance } from "./table-performance";
import { reconcileRecordResult } from "./record-editor-store";

/** Reactive inputs for one fixed entity type and a changing owning view. */
export interface MasterDetailStoreOptions {
  readonly description: EntityDescription;
  readonly initialFilter?: Accessor<FilterDefinition | undefined>;
  readonly initialSorting?: Accessor<readonly DataTableSort[] | undefined>;
  readonly filterIdentity?: Accessor<string | undefined>;
}

/** Explicit service boundary; constructing a store requires no component context. */
export interface MasterDetailStoreDependencies {
  readonly fetchService: ApplicationServices["fetchService"];
  readonly dataChanges: Pick<ApplicationServices["dataChanges"], "subscribe">;
  readonly recordMutations: Pick<ApplicationServices["recordMutations"], "update">;
  readonly navigation: Pick<
    NavigationController,
    "selectedRecordId" | "creatingRecord" | "selectRecord" | "createRecord" | "finishCreatingRecord" | "closeRecord"
  >;
  readonly actions: Pick<
    ReturnType<typeof useActions>,
    "registerTarget" | "availableActions" | "pendingAction" | "execute"
  >;
  readonly lookups: Pick<LookupService, "invalidateSource" | "label">;
  /** Schedules optional display metrics at the next painted frame. */
  readonly afterPaint?: (publish: () => void) => void;
}

/** Creates owner-scoped query and editing orchestration. Dispose its Solid owner on unmount. */
export function createMasterDetailStore(
  options: MasterDetailStoreOptions,
  dependencies: MasterDetailStoreDependencies,
) {
  const { description } = options;
  const { navigation, dataChanges, fetchService, recordMutations, actions, lookups } = dependencies;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  const editor = createEntityEditorDefinition(description);
  // The master table always renders while the first page loads, so the
  // viewport can be measured before records arrive. It is fed an empty
  // result with the same columns: binding succeeds and the headers match,
  // only the body is empty instead of carrying placeholder rows.
  const emptyResult = emptyResultFor(
    description.attributes.map((attribute) => ({ attribute: attribute.id, type: attribute.valueType })),
  );
  const [activePanel, setActivePanel] = createSignal<"filter" | "facets">();
  const [visibleFacetIds, setVisibleFacetIds] = createSignal<readonly string[]>(
    description.attributes.filter((attribute) => attribute.facet).map((attribute) => attribute.id),
  );
  const [filter, setFilter] = createSignal<FilterDefinition>(cloneFilter(options.initialFilter?.()));
  const [sorting, setSorting] = createSignal<readonly DataTableSort[]>(cloneSorting(options.initialSorting?.()));
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
  const filteredAttributes = createMemo(() => filteredEntityAttributes(filterParameters()));
  const hasFilterRestriction = createMemo(() => filteredEntityAttributes({ filter: filter() }).size > 0);
  const hasFacetRestriction = createMemo(() => facetSelections().length > 0);
  const facetedAttributes = createMemo<ReadonlySet<string>>(
    () => new Set(filterParameters().facets.map((selection) => selection.attribute)),
  );
  // Highlights use only committed quicksearch inputs, so marks cannot skew
  // from the executed search or reflect filter/facet operand values.
  const highlights = createMemo(() => {
    const parameters = filterParameters();
    return deriveColumnHighlights(parameters.search, searchAttributes(), parameters.columnSearch);
  });
  // Lookup columns resolve ids to labels with no searchable text of their
  // own, so they offer no column input. Values are live thunks so inputs
  // always read current state even though entries outlive their creation.
  const columnFilters = createMemo(() => {
    return new Map(
      description.attributes
        .filter((attribute) => !attribute.lookup)
        .map((attribute) => [
          attribute.id,
          {
            value: () => columnSearch()[attribute.id] ?? "",
            placeholder: `Filter ${attribute.label}`,
            ariaLabel: `Filter ${attribute.label}`,
            onInput: (value: string) => setColumnSearch((current) => ({ ...current, [attribute.id]: value })),
          },
        ]),
    );
  });
  const hasColumnConstraints = (attribute: string) =>
    hasAttributeFilter(filter(), attribute) ||
    facetSelections().some((selection) => selection.attribute === attribute) ||
    Boolean(columnSearch()[attribute]?.trim());
  const clearColumnConstraints = (attribute: string) => {
    const nextFilter = removeAttributeFilters(filter(), attribute);
    const nextFacets = facetSelections().filter((selection) => selection.attribute !== attribute);
    const nextColumnSearch = Object.fromEntries(
      Object.entries(columnSearch()).filter(([candidate]) => candidate !== attribute),
    );
    batch(() => {
      setFilter(nextFilter);
      setFacetSelections(nextFacets);
      setColumnSearch(nextColumnSearch);
      setFilterParameters((parameters) => ({
        ...parameters,
        filter: nextFilter,
        facets: nextFacets,
        columnSearch: trimColumnSearch(nextColumnSearch),
      }));
    });
  };
  const [showLoading, setShowLoading] = createSignal(false);
  // Viewport height drives table virtualization so only visible rows mount.
  // It is measured rather than fixed because the master pane flex-fills
  // the available shell space. The table renders from the first paint with
  // an empty body while the first page loads, so the viewport is measured
  // during the fetch and the first data paint is already virtualized.
  const [viewportHeight, setViewportHeight] = createSignal(0);
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
  let generation = 0;
  let activeFilterIdentity = options.filterIdentity?.();
  createEffect(() => {
    if (options.filterIdentity?.() === activeFilterIdentity) return;
    activeFilterIdentity = options.filterIdentity?.();
    generation++;
    const next = cloneFilter(options.initialFilter?.());
    const nextSorting = cloneSorting(options.initialSorting?.());
    batch(() => {
      setFilter(next);
      setSorting(nextSorting);
      setFacetSelections([]);
      setSearch("");
      setColumnSearch({});
      setFilterParameters({ filter: next, facets: [], search: "", columnSearch: {} });
    });
  });
  let pendingFetch: { fetchMs: number; settledAt: number; rowCount: number; columnCount: number } | undefined;
  let rowRequest = 0;
  const [records, { refetch }] = createResource(rowParameters, async (query) => {
    const request = ++rowRequest;
    const started = performance.now();
    const result = await loadEntityRecords(description, fetchService, query);
    const settledAt = performance.now();
    if (!disposed && request === rowRequest)
      pendingFetch = {
        fetchMs: settledAt - started,
        settledAt,
        rowCount: result.rows.length,
        columnCount: result.columns.length,
      };
    return result;
  });
  const readRecords = () => (records.error ? undefined : records());
  createEffect(() => {
    const result = readRecords();
    const recordId = navigation.selectedRecordId();
    if (disposed || records.loading || !result || !recordId) return;
    const identity = result.column(description.identityAttribute);
    if (identity && !result.rows.some((row) => row.value(identity) === recordId)) {
      navigation.closeRecord();
    }
  });
  const [totalCount, { refetch: refetchTotalCount }] = createResource(filterParameters, (query) =>
    loadEntityRecordCount(description, fetchService, query),
  );
  const readCount = () => (totalCount.error ? undefined : totalCount());
  const facetResources = description.attributes
    .filter((attribute) => attribute.facet)
    .map((attribute) => {
      const [result, controls] = createResource(filterParameters, (query) =>
        loadEntityFacet(description, attribute.id, fetchService, query),
      );
      return { attribute: attribute.id, result, refetch: controls.refetch };
    });
  const displayedRecords = createMemo<QueryResult | undefined>(() => {
    const result = readRecords();
    const count = readCount();
    return result && count !== undefined ? { ...result, numberOfHits: count } : result;
  });
  // Derivation cost is timed into a plain local so rendering stays pure;
  // the publish effect below reads it after the memo settles. Binding runs
  // against the empty result while the first page loads so the table can
  // render its shell from the first paint.
  let lastProcessMs = 0;
  const boundEntity = createMemo(() => {
    const loaded = readRecords();
    const result = loaded ?? emptyResult;
    const started = performance.now();
    const bound = bindEntity(result, description);
    if (loaded) lastProcessMs = performance.now() - started;
    return bound;
  });
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
    dependencies.afterPaint?.(() => {
      if (!disposed) publish();
    });
  });
  createEffect(() => {
    const loading = records.loading || totalCount.loading || facetResources.some((resource) => resource.result.loading);
    if (!loading) {
      setShowLoading(false);
      return;
    }
    const timer = setTimeout(() => setShowLoading(true), 200);
    onCleanup(() => clearTimeout(timer));
  });
  const unsubscribe = dataChanges.subscribe({ tableName: description.tableName }, (change) => {
    lookups.invalidateSource(description.tableName);
    const result = readRecords();
    if (!result) return;
    reconcileRecordResult(result, description.identityAttribute, change.recordId, change.changes);
  });
  onCleanup(unsubscribe);

  const aggregateResults = () =>
    new Map(
      facetResources.map(
        (resource) => [resource.attribute, resource.result.error ? undefined : resource.result()] as const,
      ),
    );
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
    if (state === "neutral") {
      const remaining = facetSelections().filter(
        (selection) => selection.attribute !== facetId || facetValueKey(selection.value) !== valueKey,
      );
      batch(() => {
        setFacetSelections(remaining);
        setFilterParameters((parameters) => ({ ...parameters, facets: remaining }));
      });
      return;
    }
    setFacetValue(facetId, value, state);
  };

  /** Sets one facet value directly, replacing any selection for the same value. */
  const setFacetValue = (attribute: string, value: QueryValue | null, state: "included" | "excluded") => {
    const key = facetValueKey(value);
    const remaining = facetSelections().filter(
      (selection) => selection.attribute !== attribute || facetValueKey(selection.value) !== key,
    );
    const next: readonly FacetSelection[] = [...remaining, { attribute, value, state }];
    batch(() => {
      setFacetSelections(next);
      setFilterParameters((parameters) => ({ ...parameters, facets: next }));
    });
  };

  /**
   * Builds the Table actions menu for one table cell, or undefined when the
   * cell cannot feed the facet mechanism. Lookup-backed values resolve to
   * their display labels, falling back to the raw id. Ensures the facet
   * stays visible so the new selection remains manageable.
   */
  const cellFacetMenu = async (attributeId: string, value: QueryValue | null | undefined) => {
    const attribute = description.attributes.find((candidate) => candidate.id === attributeId);
    if (!attribute?.facet || value === undefined) return undefined;
    const display = await cellDisplayLabel(attribute.lookup, value);
    setVisibleFacetIds((current) => (current.includes(attributeId) ? current : [...current, attributeId]));
    const entry = (state: "included" | "excluded") => ({
      id: contextMenuEntryId(`facet-cell-${state}-${attributeId}`),
      label: `${state === "included" ? "Include" : "Exclude"} "${display}"`,
      execute: () => setFacetValue(attributeId, value, state),
    });
    return {
      id: contextMenuGroupId("facet-actions"),
      label: "Facet actions",
      entries: [entry("included"), entry("excluded")],
    };
  };

  /** Resolves a cell value to its lookup display label, or the raw value. */
  const cellDisplayLabel = async (
    lookup: EntityDescription["attributes"][number]["lookup"],
    value: QueryValue | null,
  ): Promise<string> => {
    if (value === null) return "Unassigned";
    const raw = String(value);
    if (!lookup || !raw) return raw;
    try {
      return await lookups.label(lookup, lookupEntryId(raw));
    } catch {
      return raw;
    }
  };

  const refresh = () => {
    void refetch();
    void refetchTotalCount();
    for (const resource of facetResources) void resource.refetch();
  };

  const actionTarget = (): EntityRecordActionTarget | undefined => {
    const result = readRecords();
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

  const selectRow = (row: QueryResultRow) => {
    const id = row.value(boundEntity().identity);
    if (typeof id !== "string") return false;
    navigation.selectRecord(id);
    return true;
  };
  const table = createMemo(() => ({
    result: displayedRecords() ?? emptyResult,
    rows: readRecords()?.rows,
    entity: boundEntity(),
  }));
  const completeCreation = async (id: string) => {
    const startedGeneration = generation;
    const refreshed = await refetch();
    if (disposed || generation !== startedGeneration) return;
    void refetchTotalCount();
    for (const resource of facetResources) void resource.refetch();
    const identity = refreshed?.column(description.identityAttribute);
    if (identity && refreshed?.rows.some((row) => row.value(identity) === id)) navigation.finishCreatingRecord(id);
    else navigation.closeRecord();
  };
  return {
    description,
    editor,
    filterAttributes: entityFilterAttributes(description),
    filter,
    search,
    sorting,
    columnSearch,
    highlights,
    filteredAttributes,
    hasFilterRestriction,
    hasFacetRestriction,
    facetedAttributes,
    columnFilters,
    hasColumnConstraints,
    clearColumnConstraints,
    activePanel,
    visibleFacets,
    availableFacetKey,
    records: readRecords,
    table,
    rowLoading: () => records.loading,
    countLoading: () => totalCount.loading,
    facetLoading: () => facetResources.some((resource) => resource.result.loading),
    rowError: () => records.error as Error | undefined,
    countError: () => totalCount.error as Error | undefined,
    facetErrors: () =>
      facetResources.flatMap((resource) =>
        resource.result.error ? [{ attribute: resource.attribute, error: resource.result.error as Error }] : [],
      ),
    loading: () => showLoading() || (records.loading && !readRecords()),
    viewportHeight,
    setViewportHeight: (height: number) => setViewportHeight(height),
    selectedRecordId: navigation.selectedRecordId,
    creatingRecord: navigation.creatingRecord,
    actionTarget,
    setFilter: (value: FilterDefinition) => setFilter(value),
    setSearch: (value: string) => setSearch(value),
    setColumnSearch: (attribute: string, value: string) =>
      setColumnSearch((current) => ({ ...current, [attribute]: value })),
    setSorting: (value: readonly DataTableSort[]) => setSorting(value),
    togglePanel: (panel: "filter" | "facets") => setActivePanel((current) => (current === panel ? undefined : panel)),
    closePanel: () => setActivePanel(undefined),
    changeFacet,
    setFacetValue,
    cellFacetMenu,
    addFacet: (id: string | undefined) => {
      if (id && availableFacets().some((attribute) => attribute.id === id))
        setVisibleFacetIds((current) => [...current, id]);
    },
    removeFacet: (id: string) => setVisibleFacetIds((current) => current.filter((value) => value !== id)),
    loadFacetEntries: async (query: string) => {
      const normalized = query.trim().toLocaleLowerCase();
      const entries = availableFacets()
        .filter((attribute) => !normalized || attribute.label.toLocaleLowerCase().includes(normalized))
        .map((attribute) => ({ id: attribute.id, label: attribute.label }));
      return { entries, total: entries.length };
    },
    facetLookup: (id: string) => description.attributes.find((attribute) => attribute.id === id)?.lookup,
    facetValue: (id: string, key: string) => facetValue(aggregateResults(), id, key, facetSelections()),
    refresh,
    selectRow,
    createRecord: () => navigation.createRecord(),
    closeRecord: () => navigation.closeRecord(),
    completeCreation,
    contextMenuGroups: () => [
      {
        id: contextMenuGroupId("record-actions"),
        label: `${description.label} actions`,
        entries: actionsToContextMenuEntries(actions.availableActions(), {
          disabled: Boolean(actions.pendingAction()),
          execute: actions.execute,
        }),
      },
    ],
  };
}

/** Read-only accessors and named operations exposed to the rendering layer. */
export type MasterDetailStore = ReturnType<typeof createMasterDetailStore>;
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
    const timer = setTimeout(() => commit(current), 300);
    onCleanup(() => clearTimeout(timer));
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
