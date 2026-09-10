import { createResource, Match, Switch } from "solid-js";

import { DataTable } from "../../../../components/DataTable";
import { IconButton } from "../../../../components/IconButton";
import { bindEntity, createEntityTableColumns } from "../../entities/bound-entity";
import { createEntityEditorDefinition } from "../../entities/entity-editor";
import { entityId } from "../../entities/entity-description";
import { useEntityRegistry } from "../../entities/entity-registry";
import { MasterDetailView } from "../../master-detail/MasterDetailView";
import { useNavigation } from "../../../../base/navigation";
import type { FetchService } from "../../../../base/services/fetch-service";
import { loadUsers } from "./users-api";
import styles from "./Users.module.css";

export function Users(props: { fetchService: FetchService }) {
  const navigation = useNavigation();
  const userEntity = useEntityRegistry().require(entityId("users"));
  const userEditor = createEntityEditorDefinition(userEntity);
  const [users, { refetch }] = createResource(() => loadUsers(props.fetchService));

  return (
    <Switch>
      <Match when={users.error}>
        <p class={styles.error} role="alert">
          {users.error.message}
        </p>
      </Match>
      <Match when={users.loading}>
        <p class={styles.loading}>Loading users...</p>
      </Match>
      <Match when={users()}>
        {(result) => {
          const entity = bindEntity(result(), userEntity);
          return (
            <MasterDetailView
              master={
                <>
                  <div class={styles.toolbar}>
                    <IconButton label="New user" icon="+" onClick={() => navigation.createRecord()} />
                  </div>
                  <DataTable
                    ariaLabel="Users"
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
              definition={userEditor}
              fetchService={props.fetchService}
              result={result()}
              selectedRecordId={navigation.selectedRecordId()}
              creating={navigation.creatingRecord()}
              onCreated={async (id) => {
                const refreshed = await refetch();
                const identity = refreshed?.column("id");
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
