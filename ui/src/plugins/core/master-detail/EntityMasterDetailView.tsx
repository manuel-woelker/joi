import FunnelIcon from "lucide-solid/icons/funnel";
import GemIcon from "lucide-solid/icons/gem";
import RefreshCwIcon from "lucide-solid/icons/refresh-cw";
import XIcon from "lucide-solid/icons/x";
import { For, Match, onCleanup, Show, Switch } from "solid-js";
import { useNavigation } from "../../../base/navigation";
import { useApplicationServices } from "../../../base/services/application-services";
import { useContextMenu } from "../../../components/context-menu/ContextMenuProvider";
import { contextMenuEntryId, contextMenuGroupId } from "../../../components/context-menu/context-menu";
import { DataTable, type DataTableSort } from "../../../components/DataTable";
import { FacetFilter } from "../../../components/facet/FacetFilter";
import { FilterDefinitionEditor } from "../../../components/filter-definition/FilterDefinitionEditor";
import type { FilterDefinition } from "../../../components/filter-definition/filter-model";
import { IconButton } from "../../../components/IconButton";
import { QuickFilterInput } from "../../../components/QuickFilterInput";
import { Select } from "../../../components/Select";
import { Tooltip } from "../../../components/Tooltip";
import { useActions } from "../actions/ActionProvider";
import { createEntityTableColumns } from "../entities/bound-entity";
import type { EntityId } from "../entities/entity-description";
import { useEntityRegistry } from "../entities/entity-registry";
import { LookupValue, useLookupService } from "../lookups/lookup";
import type { QueryColumnHandle, QueryResultRow } from "../query/query-result";
import { createMasterDetailStore } from "./master-detail-store";
import styles from "./EntityMasterDetailView.module.css";
import { MasterDetailView } from "./MasterDetailView";

/** Renders the entity store and adapts browser events and measurements. */
export function EntityMasterDetailView(props: {
  entityId: EntityId;
  initialFilter?: FilterDefinition;
  initialSorting?: readonly DataTableSort[];
  filterIdentity?: string;
}) {
  return (
    <Show keyed when={props.entityId}>
      {(entityId) => <EntityMasterDetailContent {...props} entityId={entityId} />}
    </Show>
  );
}

function EntityMasterDetailContent(props: {
  entityId: EntityId;
  initialFilter?: FilterDefinition;
  initialSorting?: readonly DataTableSort[];
  filterIdentity?: string;
}) {
  const services = useApplicationServices();
  const { fetchService } = services;
  const contextMenu = useContextMenu();
  const description = useEntityRegistry().require(props.entityId);
  const store = createMasterDetailStore(
    {
      description,
      initialFilter: () => props.initialFilter,
      initialSorting: () => props.initialSorting,
      filterIdentity: () => props.filterIdentity,
    },
    {
      ...services,
      navigation: useNavigation(),
      actions: useActions(),
      lookups: useLookupService(),
      afterPaint: (publish) => {
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(publish);
        else publish();
      },
    },
  );
  const observeViewportHeight = (element: HTMLDivElement) => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => store.setViewportHeight(entries[0]?.contentRect.height ?? 0));
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  };
  const openContextMenu = async (event: MouseEvent, row: QueryResultRow, column?: QueryColumnHandle) => {
    if (!store.selectRow(row)) return;
    const cellGroup = column ? await store.cellFacetMenu(column.attribute, row.value(column)) : undefined;
    const groups = [...store.contextMenuGroups(), ...(cellGroup ? [cellGroup] : [])];
    contextMenu.open({ event, createGroups: () => groups });
  };
  return (
    <Switch>
      <Match when={store.rowError()}>
        <p class={styles.error} role="alert">
          {store.rowError()?.message}
        </p>
      </Match>
      <Match when={store.records() || store.rowLoading()}>
        <MasterDetailView
          leadingPanel={
            store.activePanel() === "filter" ? (
              <div class={styles.filterPanel} aria-label={`Filter ${description.pluralLabel}`}>
                <header class={styles.filterHeader}>
                  <h2 class={styles.panelTitle}>
                    <FunnelIcon size={15} />
                    Filter {description.pluralLabel}
                  </h2>
                  <IconButton label="Close filter" icon={<XIcon size={16} />} onClick={() => store.closePanel()} />
                </header>
                <FilterDefinitionEditor
                  attributes={store.filterAttributes}
                  value={store.filter()}
                  onChange={store.setFilter}
                  ariaLabel={`Filter ${description.pluralLabel}`}
                />
              </div>
            ) : store.activePanel() === "facets" ? (
              <div class={styles.filterPanel} aria-label={`${description.pluralLabel} facets`}>
                <header class={styles.filterHeader}>
                  <h2 class={styles.panelTitle}>
                    <GemIcon size={15} />
                    {description.pluralLabel} facets
                  </h2>
                  <IconButton label="Close facets" icon={<XIcon size={16} />} onClick={() => store.closePanel()} />
                </header>
                <For each={store.facetErrors()}>
                  {(failure) => (
                    <p class={styles.error} role="alert">
                      {failure.error.message}
                    </p>
                  )}
                </For>
                <Show
                  keyed
                  when={store.availableFacetKey()}
                  fallback={<p class={styles.noFacets}>All available facets are shown.</p>}
                >
                  <Select
                    ariaLabel="Add facet"
                    value=""
                    placeholder="Add facet..."
                    density="compact"
                    loadEntries={store.loadFacetEntries}
                    entryId={(entry) => entry.id}
                    entryText={(entry) => entry.label}
                    onChange={store.addFacet}
                  />
                </Show>
                <Show when={store.visibleFacets().length}>
                  <FacetFilter
                    class={styles.facets}
                    facets={store.visibleFacets()}
                    onValueChange={store.changeFacet}
                    onRemoveFacet={store.removeFacet}
                    renderValue={(facet, value) => {
                      const lookup = store.facetLookup(facet.id);
                      const raw = store.facetValue(facet.id, value.value);
                      return lookup && typeof raw === "string" && raw ? (
                        <LookupValue lookup={lookup} value={raw} />
                      ) : (
                        value.label
                      );
                    }}
                  />
                </Show>
                <Show when={!store.visibleFacets().length && store.availableFacetKey()}>
                  <p class={styles.noFacets}>Select a facet from the dropdown above.</p>
                </Show>
              </div>
            ) : undefined
          }
          master={
            <>
              <div class={styles.toolbar}>
                <QuickFilterInput
                  class={styles.searchField}
                  leadingIcon="⌕"
                  value={store.search}
                  onInput={store.setSearch}
                  placeholder={`Search ${description.pluralLabel.toLowerCase()}`}
                  ariaLabel={`Search ${description.pluralLabel.toLowerCase()}`}
                />
                <Tooltip
                  content={() => (
                    <div class={styles.constraintSummary}>
                      <strong>Filters</strong>
                      <Show when={store.filterSummary().length} fallback={<div>No active filters</div>}>
                        <For each={store.filterSummary()}>
                          {(line) => <div style={{ "padding-left": `${line.depth * 12}px` }}>{line.text}</div>}
                        </For>
                      </Show>
                    </div>
                  )}
                >
                  <IconButton
                    label={
                      store.activePanel() === "filter"
                        ? "Close filter"
                        : `Filter ${description.pluralLabel.toLowerCase()}`
                    }
                    icon={<FunnelIcon size={17} />}
                    text="Filter"
                    aria-expanded={store.activePanel() === "filter"}
                    data-restricted={store.hasFilterRestriction() ? "" : undefined}
                    class={`${styles.filterButton} ${store.activePanel() === "filter" ? styles.activeFilter : ""}`}
                    onClick={() => store.togglePanel("filter")}
                  />
                </Tooltip>
                <Tooltip
                  content={() => (
                    <div class={styles.constraintSummary}>
                      <strong>Facets</strong>
                      <Show when={store.facetSummary().length} fallback={<div>No active facets</div>}>
                        <For each={store.facetSummary()}>
                          {(selection) => (
                            <div>
                              {selection.attribute}: {selection.state === "included" ? "Include" : "Exclude"} {'"'}
                              {selection.value === null ? (
                                "Unassigned"
                              ) : selection.lookup && typeof selection.value === "string" ? (
                                <LookupValue lookup={selection.lookup} value={selection.value} />
                              ) : (
                                String(selection.value)
                              )}
                              {'"'}
                            </div>
                          )}
                        </For>
                      </Show>
                    </div>
                  )}
                >
                  <IconButton
                    label={
                      store.activePanel() === "facets"
                        ? "Close facets"
                        : `Show ${description.pluralLabel.toLowerCase()} facets`
                    }
                    icon={<GemIcon size={17} />}
                    text="Facets"
                    aria-expanded={store.activePanel() === "facets"}
                    data-restricted={store.hasFacetRestriction() ? "" : undefined}
                    class={`${styles.facetButton} ${store.activePanel() === "facets" ? styles.activeFilter : ""}`}
                    onClick={() => store.togglePanel("facets")}
                  />
                </Tooltip>
                <IconButton
                  label={`Refresh ${description.pluralLabel.toLowerCase()}`}
                  icon={<RefreshCwIcon size={17} />}
                  text="Refresh"
                  class={styles.refreshButton}
                  onClick={store.refresh}
                />
                <IconButton
                  label={`New ${description.label.toLowerCase()}`}
                  icon="+"
                  text={`New ${description.label.toLowerCase()}`}
                  class={styles.createButton}
                  onClick={store.createRecord}
                />
              </div>
              <Show when={store.countError()}>
                {(error) => (
                  <p class={styles.error} role="alert">
                    {error().message}
                  </p>
                )}
              </Show>
              <div ref={observeViewportHeight} class={styles.tableViewport}>
                <DataTable
                  ariaLabel={description.pluralLabel}
                  result={store.table().result}
                  rows={store.table().rows}
                  columns={createEntityTableColumns(store.table().entity)}
                  highlights={store.highlights()}
                  filteredAttributes={store.filteredAttributes()}
                  facetedAttributes={store.facetedAttributes()}
                  columnFilters={store.columnFilters()}
                  onColumnHeaderContextMenu={(event, attribute) =>
                    contextMenu.open({
                      event,
                      createGroups: () => [
                        {
                          id: contextMenuGroupId("column-filters"),
                          entries: [
                            {
                              id: contextMenuEntryId("clear-column-filters"),
                              label: "Clear filters and facets",
                              disabled: !store.hasColumnConstraints(attribute),
                              execute: () => store.clearColumnConstraints(attribute),
                            },
                          ],
                        },
                      ],
                    })
                  }
                  loading={store.loading()}
                  loadingMessage="Loading..."
                  fillHeight
                  fillWidth
                  virtualization={store.viewportHeight() > 0 ? { height: store.viewportHeight() } : undefined}
                  sorting={store.sorting()}
                  onSortingChange={store.setSorting}
                  rowKey={store.table().entity.identity}
                  selectedRowKey={store.selectedRecordId()}
                  density="compact"
                  emptyMessage={`No matching ${description.pluralLabel.toLowerCase()} found.`}
                  onRowSelect={store.selectRow}
                  onRowContextMenu={openContextMenu}
                />
              </div>
            </>
          }
          definition={store.editor}
          fetchService={fetchService}
          result={store.records()}
          selectedRecordId={store.selectedRecordId()}
          creating={store.creatingRecord()}
          onCreated={store.completeCreation}
          onClose={store.closeRecord}
        />
      </Match>
    </Switch>
  );
}
