import { Show } from "solid-js";

import { IconButton } from "./components/IconButton";
import { NavigationTree } from "./components/NavigationTree";
import { ViewContent } from "./components/ViewContent";
import { ViewEditor } from "./components/ViewEditor";
import { createApplicationPluginRegistry } from "./application-registry";
import type { PluginRegistry } from "./plugins/registry";
import { StatusBar } from "./status-bar/StatusBar";
import { WorkspaceProvider, useWorkspace } from "./workspace/controller";
import styles from "./App.module.css";

const applicationPluginRegistry = createApplicationPluginRegistry();

function WorkspaceApp(props: { pluginRegistry: PluginRegistry }) {
  const controller = useWorkspace();
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
        <NavigationTree />
        <ViewContent />
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
