import { createMemo, createResource, createSignal, Match, onCleanup, Switch } from "solid-js";
import FunnelIcon from "lucide-solid/icons/funnel";
import XIcon from "lucide-solid/icons/x";

import { useNavigation } from "../../../base/navigation";
import { DataTable } from "../../../components/DataTable";
import { entityFilterAttributes } from "../../../components/filter-definition/entity-filter-attributes";
import { matchesFilter } from "../../../components/filter-definition/filter-evaluation";
import { FilterDefinitionEditor } from "../../../components/filter-definition/FilterDefinitionEditor";
import { createCompositeFilter, type FilterDefinition } from "../../../components/filter-definition/filter-model";
import { IconButton } from "../../../components/IconButton";
import { bindEntity, createEntityTableColumns } from "../entities/bound-entity";
import { createEntityEditorDefinition } from "../entities/entity-editor";
import type { EntityId } from "../entities/entity-description";
import { useEntityRegistry } from "../entities/entity-registry";
import { useLookupService } from "../lookups/lookup";
import { loadEntityRecords } from "../saved-views/entity-query";
import { useApplicationServices } from "../../../base/services/application-services";
import { MasterDetailView } from "./MasterDetailView";
import styles from "./EntityMasterDetailView.module.css";

/** Generic create, list, and edit view driven by one entity description. */
export function EntityMasterDetailView(props: { entityId: EntityId }) {
  const navigation = useNavigation();
  const { dataChanges, fetchService } = useApplicationServices();
  const lookups = useLookupService();
  const description = useEntityRegistry().require(props.entityId);
  const editor = createEntityEditorDefinition(description);
  const [filterOpen, setFilterOpen] = createSignal(false);
  const [filter, setFilter] = createSignal<FilterDefinition>(createCompositeFilter());
  const [records, { refetch }] = createResource(() => loadEntityRecords(description, fetchService));
  const unsubscribe = dataChanges.subscribe({ tableName: description.tableName }, () => {
    lookups.invalidateSource(description.tableName);
  });
  onCleanup(unsubscribe);

  return (
    <Switch>
      <Match when={records.error}>
        <p class={styles.error} role="alert">
          {records.error.message}
        </p>
      </Match>
      <Match when={records.loading}>
        <p class={styles.loading}>Loading {description.pluralLabel.toLowerCase()}...</p>
      </Match>
      <Match when={records()}>
        {(result) => {
          const entity = bindEntity(result(), description);
          const filteredRows = createMemo(() =>
            result().rows.filter((row) =>
              matchesFilter(filter(), (attribute) => {
                const value = row.value(result().requireColumn(attribute));
                return typeof value === "string" || typeof value === "number" ? value : undefined;
              }),
            ),
          );
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
                    <IconButton
                      label={`New ${description.label.toLowerCase()}`}
                      icon="+"
                      onClick={() => navigation.createRecord()}
                    />
                  </div>
                  <DataTable
                    ariaLabel={description.pluralLabel}
                    result={result()}
                    rows={filteredRows()}
                    columns={createEntityTableColumns(entity)}
                    rowKey={entity.identity}
                    selectedRowKey={navigation.selectedRecordId()}
                    density="compact"
                    onRowSelect={(row) => {
                      const id = row.value(entity.identity);
                      if (typeof id === "string") navigation.selectRecord(id);
                    }}
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
