import { createResource, Match, Switch, onCleanup } from "solid-js";
import styles from "./App.module.css";
import { createApplication } from "./base/application-registry";
import type { PluginRegistry } from "./base/plugin-registry";
import type { ApplicationServices } from "./base/services/application-services";
import { FetchError, fetchService } from "./base/services/fetch-service";
import { loadCurrentUser, logout } from "./plugins/core/authentication/authentication-service";
import { Login } from "./plugins/core/authentication/Login";
import { ApplicationShell } from "./plugins/core/shell/ApplicationShell";

export default function App(props: { pluginRegistry?: PluginRegistry; services?: ApplicationServices }) {
  console.info("[Startup] Initializing application");
  const application = props.pluginRegistry && props.services ? undefined : createApplication();
  const [user, { refetch }] = createResource(() => loadCurrentUserWithRetry());
  let refreshingSession = false;
  const unsubscribeUnauthorized = fetchService.onUnauthorized(() => {
    if (!user() || refreshingSession) return;
    refreshingSession = true;
    void Promise.resolve(refetch()).finally(() => {
      refreshingSession = false;
    });
  });
  onCleanup(unsubscribeUnauthorized);
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
            registry={props.pluginRegistry ?? application!.registry}
            services={props.services ?? application!.services}
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

async function loadCurrentUserWithRetry(): Promise<Awaited<ReturnType<typeof loadCurrentUser>>> {
  let attempt = 0;
  console.info("[Startup] Loading user session");
  for (;;) {
    attempt += 1;
    console.info(`[Startup] Loading user session (attempt ${attempt})`);
    try {
      const user = await loadCurrentUser(fetchService);
      console.info("[Startup] User session loaded");
      return user;
    } catch (error) {
      if (!(error instanceof FetchError) || error.status !== 502) {
        console.error("[Startup] User session loading failed", error);
        throw error;
      }
      console.warn("[Startup] User session backend unavailable (HTTP 502); retrying in 3 seconds");
      await new Promise((resolve) => window.setTimeout(resolve, 3_000));
    }
  }
}
