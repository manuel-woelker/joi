import { createResource, Match, Switch } from "solid-js";
import styles from "./App.module.css";
import { createApplication } from "./base/application-registry";
import type { PluginRegistry } from "./base/plugin-registry";
import type { ApplicationServices } from "./base/services/application-services";
import { fetchService } from "./base/services/fetch-service";
import { loadCurrentUser, logout } from "./plugins/core/authentication/authentication-service";
import { Login } from "./plugins/core/authentication/Login";
import { ApplicationShell } from "./plugins/core/shell/ApplicationShell";

const application = createApplication();

export default function App(props: { pluginRegistry?: PluginRegistry; services?: ApplicationServices }) {
  const [user, { refetch }] = createResource(() => loadCurrentUser(fetchService));
  return (
    <Switch>
      <Match when={user.loading}>
        <main class={styles.startupStatus}>Loading session...</main>
      </Match>
      <Match when={user.error}>
        <Login fetchService={fetchService} onLogin={() => void refetch()} />
      </Match>
      <Match when={user()}>
        {(currentUser) => (
          <ApplicationShell
            registry={props.pluginRegistry ?? application.registry}
            services={props.services ?? application.services}
            user={currentUser()}
            onLogout={async () => {
              await logout(fetchService);
              await refetch();
            }}
          />
        )}
      </Match>
    </Switch>
  );
}
