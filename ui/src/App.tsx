import { createResource, Match, Show, Switch } from "solid-js";
import styles from "./App.module.css";
import { ActionProvider } from "./plugins/core/actions/ActionProvider";
import { ActionQuickLauncher } from "./plugins/core/actions/ActionQuickLauncher";
import { administrationEntries } from "./plugins/core/administration/Administration";
import { createApplication } from "./base/application-registry";
import { type AuthenticatedUser, loadCurrentUser, logout } from "./plugins/core/authentication/authentication-service";
import { Login } from "./plugins/core/authentication/Login";
import { UserMenu } from "./plugins/core/authentication/UserMenu";
import { ContextMenuProvider } from "./components/context-menu/ContextMenuProvider";
import { IconButton } from "./components/IconButton";
import { NavigationTree } from "./plugins/ticket/components/NavigationTree";
import { SavedViewCommands, SavedViewContent } from "./plugins/ticket/components/SavedViewContent";
import { ViewContent } from "./components/ViewContent";
import { ViewEditor } from "./plugins/ticket/components/ViewEditor";
import { ticketEntity } from "./plugins/ticket/entities/ticket-entity";
import { LookupProvider } from "./plugins/core/lookups/lookup";
import type { PluginRegistry } from "./base/plugin-registry";
import { type ApplicationServices, ApplicationServicesProvider } from "./base/services/application-services";
import { fetchService } from "./base/services/fetch-service";
import { StatusBar } from "./plugins/core/status-bar/StatusBar";
import type { ApplicationView } from "./views/view";
import { useWorkspace, WorkspaceProvider } from "./plugins/ticket/workspace/controller";

const application = createApplication();

function WorkspaceApp(props: {
  pluginRegistry: PluginRegistry;
  services: ApplicationServices;
  user: AuthenticatedUser;
  onLogout: () => Promise<void>;
}) {
  const controller = useWorkspace();
  const entries = administrationEntries(props.pluginRegistry);
  const selectedView = (): ApplicationView | undefined => {
    const selection = controller.navigation.selection();
    const administrationId = controller.navigation.selectedAdministrationId();
    if (administrationId) {
      return entries.find((entry) => entry.id === administrationId);
    }

    const view = controller.selectedView();
    return view
      ? {
          ...view,
          section: "Saved view",
          icon: ticketEntity.icon,
          content: SavedViewContent,
          commands: SavedViewCommands,
        }
      : undefined;
  };
  return (
    <ApplicationServicesProvider services={props.services}>
      <ContextMenuProvider>
        <ActionProvider registry={props.pluginRegistry} currentUser={props.user}>
          <ActionQuickLauncher />
          <LookupProvider registry={props.pluginRegistry}>
            <div class={styles.appShell} style={{ "--sidebar-width": `${controller.sidebarWidth()}px` }}>
              <header class={styles.topBar}>
                <div class={styles.topBarStart}>
                  <IconButton
                    class={styles.mobileNavigationButton}
                    label="Open navigation"
                    icon="☰"
                    onClick={() => controller.setNavigationOpen(true)}
                  />
                  <a class={styles.brand} href="/" aria-label="Joi home">
                    Joi
                  </a>
                  <span class={styles.topDivider} />
                  <span class={styles.currentView}>{selectedView()?.name ?? "Workspace"}</span>
                </div>
                <div class={styles.topCommands}>
                  <UserMenu user={props.user} onLogout={props.onLogout} />
                  <Show when={controller.announcement().includes("Undo")}>
                    <button class={styles.textButton} onClick={() => controller.undo()}>
                      <span aria-hidden="true">↶</span>Undo
                    </button>
                  </Show>
                  <IconButton label="Reset demo workspace" icon="↻" onClick={() => controller.reset()} />
                </div>
              </header>
              <Show when={controller.navigationOpen()}>
                <button
                  class={styles.navigationBackdrop}
                  aria-label="Close navigation"
                  onClick={() => controller.setNavigationOpen(false)}
                />
              </Show>
              <div class={styles.workspaceLayout}>
                <NavigationTree registry={props.pluginRegistry} />
                <ViewContent view={selectedView()} />
              </div>
              <StatusBar registry={props.pluginRegistry} />
              <ViewEditor />
              <Show when={controller.warning()}>
                <div class={styles.warningBanner} role="alert">
                  {controller.warning()}
                </div>
              </Show>
              <div class={styles.srOnly} aria-live="polite">
                {controller.announcement()}
              </div>
            </div>
          </LookupProvider>
        </ActionProvider>
      </ContextMenuProvider>
    </ApplicationServicesProvider>
  );
}

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
          <WorkspaceProvider>
            <WorkspaceApp
              pluginRegistry={props.pluginRegistry ?? application.registry}
              services={props.services ?? application.services}
              user={currentUser()}
              onLogout={async () => {
                await logout(fetchService);
                await refetch();
              }}
            />
          </WorkspaceProvider>
        )}
      </Match>
    </Switch>
  );
}
