import { Show } from "solid-js";
import { Menu, RotateCcw, Undo2 } from "lucide-solid";

import { IconButton } from "./components/IconButton";
import { NavigationTree } from "./components/NavigationTree";
import { ViewContent } from "./components/ViewContent";
import { ViewEditor } from "./components/ViewEditor";
import { WorkspaceProvider, useWorkspace } from "./workspace/controller";

function WorkspaceApp() {
  const controller = useWorkspace();
  return (
    <div class="app-shell" style={{ "--sidebar-width": `${controller.sidebarWidth()}px` }}>
      <header class="top-bar">
        <div class="top-bar-start"><IconButton class="mobile-navigation-button" label="Open navigation" icon={Menu} onClick={() => controller.setNavigationOpen(true)} /><a class="brand" href="/" aria-label="Joi home">Joi</a><span class="top-divider" /><span class="current-view">{controller.selectedView()?.name ?? "Workspace"}</span></div>
        <div class="top-actions"><Show when={controller.announcement().includes("Undo")}><button class="text-button" onClick={() => controller.undo()}><Undo2 size={15} />Undo</button></Show><IconButton label="Reset demo workspace" icon={RotateCcw} onClick={() => controller.reset()} /></div>
      </header>
      <Show when={controller.navigationOpen()}><button class="navigation-backdrop" aria-label="Close navigation" onClick={() => controller.setNavigationOpen(false)} /></Show>
      <div class="workspace-layout"><NavigationTree /><ViewContent /></div>
      <ViewEditor />
      <Show when={controller.warning()}><div class="warning-banner" role="alert">{controller.warning()}</div></Show>
      <div class="sr-only" aria-live="polite">{controller.announcement()}</div>
    </div>
  );
}

export default function App() {
  return <WorkspaceProvider><WorkspaceApp /></WorkspaceProvider>;
}
