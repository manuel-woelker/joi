import { createResource, Match, Switch } from "solid-js";

import { DataTable } from "../../components/DataTable";
import { MasterDetailView } from "../../master-detail/MasterDetailView";
import type { MasterDetailDefinition } from "../../master-detail/definition";
import type { FetchService } from "../../services/fetch-service";
import { useWorkspace } from "../../workspace/controller";
import { loadUsers } from "./users-api";
import styles from "./Users.module.css";

const userEditor: MasterDetailDefinition = {
  tableName: "users",
  identityAttribute: "id",
  detailTitle: "User details",
  fields: [
    { attribute: "username", label: "Username", control: "text", required: true },
    { attribute: "name", label: "Name", control: "text", required: true },
  ],
};

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
          const identity = result().requireColumn("id");
          return (
            <MasterDetailView
              master={
                <DataTable
                  ariaLabel="Users"
                  result={result()}
                  columns={[
                    { column: result().requireColumn("username"), header: "Username" },
                    { column: result().requireColumn("name"), header: "Name" },
                  ]}
                  rowKey={identity}
                  density="compact"
                  onRowClick={(row) => {
                    const id = row.value(identity);
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
