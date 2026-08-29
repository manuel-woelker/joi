import { createResource, For, Match, Switch } from "solid-js";

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
        {(records) => (
          <table class={styles.table}>
            <thead>
              <tr>
                <th>Username</th>
                <th>Name</th>
              </tr>
            </thead>
            <tbody>
              <For each={records()}>
                {(user) => (
                  <tr>
                    <td>{user.username}</td>
                    <td>{user.name}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        )}
      </Match>
    </Switch>
  );
}
