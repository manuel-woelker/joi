import { Show } from "solid-js";

import { IconButton } from "./components/IconButton";
import { NavigationTree } from "./components/NavigationTree";
import { ViewContent } from "./components/ViewContent";
import { ViewEditor } from "./components/ViewEditor";
import { DebugTools } from "./plugins/debug/core/DebugTools";
import { createApplicationPluginRegistry } from "./application-registry";
import type { PluginRegistry } from "./plugins/registry";
import { REVISION } from "./revision";
import { WorkspaceProvider, useWorkspace } from "./workspace/controller";

const applicationPluginRegistry = createApplicationPluginRegistry();

function WorkspaceApp(props: { pluginRegistry: PluginRegistry }) {
  const controller = useWorkspace();
  return (
    <div class="app-shell" style={{ "--sidebar-width": `${controller.sidebarWidth()}px` }}>
      <header class="top-bar">
        <div class="top-bar-start">
          <IconButton
            class="mobile-navigation-button"
            label="Open navigation"
            icon="☰"
            onClick={() => controller.setNavigationOpen(true)}
          />
          <a class="brand" href="/" aria-label="Joi home">
            Joi
          </a>
          <span class="top-divider" />
          <span class="current-view">{controller.selectedView()?.name ?? "Workspace"}</span>
        </div>
        <div class="top-actions">
          <Show when={controller.announcement().includes("Undo")}>
            <button class="text-button" onClick={() => controller.undo()}>
              <span aria-hidden="true">↶</span>Undo
            </button>
          </Show>
          <IconButton label="Reset demo workspace" icon="↻" onClick={() => controller.reset()} />
        </div>
      </header>
      <Show when={controller.navigationOpen()}>
        <button
          class="navigation-backdrop"
          aria-label="Close navigation"
          onClick={() => controller.setNavigationOpen(false)}
        />
      </Show>
      <div class="workspace-layout">
        <NavigationTree />
        <ViewContent />
      </div>
      <footer class="footer">
        <div class="footer-start">
          <span>Joi</span>
          <span class="status-revision">{REVISION}</span>
        </div>
        <div class="footer-end">
          <span>Built with SolidJS</span>
          <DebugTools registry={props.pluginRegistry} />
        </div>
      </footer>
      <ViewEditor />
      <Show when={controller.warning()}>
        <div class="warning-banner" role="alert">
          {controller.warning()}
        </div>
      </Show>
      <div class="sr-only" aria-live="polite">
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
