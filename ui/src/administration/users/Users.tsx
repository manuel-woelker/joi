import { createResource, Match, Switch } from "solid-js";

import { DataTable } from "../../components/DataTable";
import { bindEntity, createEntityTableColumns } from "../../entities/bound-entity";
import { createEntityEditorDefinition } from "../../entities/entity-editor";
import { userEntity } from "../../entities/user-entity";
import { MasterDetailView } from "../../master-detail/MasterDetailView";
import type { FetchService } from "../../services/fetch-service";
import { useWorkspace } from "../../workspace/controller";
import { loadUsers } from "./users-api";
import styles from "./Users.module.css";

const userEditor = createEntityEditorDefinition(userEntity);

export function Users(props: { fetchService: FetchService }) {
  const controller = useWorkspace();
  const [users] = createResource(() => loadUsers(props.fetchService));

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
                <DataTable
                  ariaLabel="Users"
                  result={result()}
                  columns={createEntityTableColumns(entity)}
                  rowKey={entity.identity}
                  density="compact"
                  onRowClick={(row) => {
                    const id = row.value(entity.identity);
                    if (typeof id === "string") controller.selectRecord(id);
                  }}
                />
              }
              definition={userEditor}
              fetchService={props.fetchService}
              result={result()}
              selectedRecordId={controller.navigation.selectedRecordId()}
              onClose={() => controller.closeRecord()}
            />
          );
        }}
      </Match>
    </Switch>
  );
}
