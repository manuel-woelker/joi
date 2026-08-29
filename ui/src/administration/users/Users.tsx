import { createResource, Match, Switch } from "solid-js";

import { DataTable } from "../../components/DataTable";
import type { FetchService } from "../../services/fetch-service";
import { loadUsers } from "./users-api";
import styles from "./Users.module.css";

export function Users(props: { fetchService: FetchService }) {
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
        {(result) => (
          <DataTable
            ariaLabel="Users"
            result={result()}
            columns={[
              { column: result().requireColumn("username"), header: "Username" },
              { column: result().requireColumn("name"), header: "Name" },
            ]}
            rowKey={result().requireColumn("username")}
            density="compact"
          />
        )}
      </Match>
    </Switch>
  );
}
