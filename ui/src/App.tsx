import { Show, createSignal, onCleanup } from "solid-js";

import { IconButton } from "./components/IconButton";
import { NavigationTree } from "./components/NavigationTree";
import { ViewContent } from "./components/ViewContent";
import { ViewEditor } from "./components/ViewEditor";
import { createApplicationPluginRegistry } from "./application-registry";
import { administrationEntries } from "./administration/Administration";
import type { AdministrationContribution } from "./administration/contribution";
import type { PluginRegistry } from "./plugins/registry";
import { StatusBar } from "./status-bar/StatusBar";
import { WorkspaceProvider, useWorkspace } from "./workspace/controller";
import styles from "./App.module.css";

const applicationPluginRegistry = createApplicationPluginRegistry();

function WorkspaceApp(props: { pluginRegistry: PluginRegistry }) {
  const controller = useWorkspace();
  const entries = administrationEntries(props.pluginRegistry);
  const administrationFromHash = () => {
    const match = window.location.hash.match(/^#\/administration\/(.+)$/);
    return entries.find((entry) => entry.id === match?.[1]);
  };
  const [selectedAdministration, setSelectedAdministration] = createSignal<AdministrationContribution | undefined>(
    administrationFromHash(),
  );
  const selectAdministration = (contribution: AdministrationContribution) => {
    setSelectedAdministration(contribution);
    window.location.hash = `/administration/${contribution.id}`;
    controller.setNavigationOpen(false);
  };
  const selectView = () => setSelectedAdministration(undefined);
  const onHashChange = () => setSelectedAdministration(administrationFromHash());
  window.addEventListener("hashchange", onHashChange);
  onCleanup(() => window.removeEventListener("hashchange", onHashChange));
  return (
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
          <span class={styles.currentView}>{controller.selectedView()?.name ?? "Workspace"}</span>
        </div>
        <div class={styles.topActions}>
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
        <NavigationTree
          registry={props.pluginRegistry}
          selectedAdministrationId={selectedAdministration()?.id}
          onAdministrationSelect={selectAdministration}
          onViewSelect={selectView}
        />
        <ViewContent administration={selectedAdministration()} />
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
  );
}

export default function App(props: { pluginRegistry?: PluginRegistry }) {
  return (
    <WorkspaceProvider>
      <WorkspaceApp pluginRegistry={props.pluginRegistry ?? applicationPluginRegistry} />
    </WorkspaceProvider>
  );
}
