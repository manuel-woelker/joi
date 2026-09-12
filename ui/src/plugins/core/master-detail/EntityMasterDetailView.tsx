import { createResource, Match, onCleanup, Switch } from "solid-js";

import { useNavigation } from "../../../base/navigation";
import { DataTable } from "../../../components/DataTable";
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
          return (
            <MasterDetailView
              master={
                <>
                  <div class={styles.toolbar}>
                    <IconButton
                      label={`New ${description.label.toLowerCase()}`}
                      icon="+"
                      onClick={() => navigation.createRecord()}
                    />
                  </div>
                  <DataTable
                    ariaLabel={description.pluralLabel}
                    result={result()}
                    columns={createEntityTableColumns(entity)}
                    rowKey={entity.identity}
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
