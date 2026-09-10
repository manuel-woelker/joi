import { createMemo, createSignal, For, Show, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";

import styles from "../../../App.module.css";
import { createNavigationController, NavigationProvider, useNavigation } from "../../../base/navigation";
import type { PluginRegistry } from "../../../base/plugin-registry";
import { PluginRegistryProvider } from "../../../base/plugin-registry-context";
import type { ApplicationServices } from "../../../base/services/application-services";
import { ApplicationServicesProvider } from "../../../base/services/application-services";
import { ContextMenuProvider } from "../../../components/context-menu/ContextMenuProvider";
import { IconButton } from "../../../components/IconButton";
import { ViewContent } from "../../../components/ViewContent";
import { ActionProvider } from "../actions/ActionProvider";
import { ActionQuickLauncher } from "../actions/ActionQuickLauncher";
import type { AuthenticatedUser } from "../authentication/authentication-service";
import { UserMenu } from "../authentication/UserMenu";
import { LookupProvider } from "../lookups/lookup";
import { EntityRegistryProvider } from "../entities/entity-registry";
import { StatusBar } from "../status-bar/StatusBar";
import {
  applicationProviders,
  navigationSections,
  shellOverlays,
  topBarContributions,
  viewResolvers,
} from "./contribution";
import type { ApplicationView } from "../../../views/view";

function ordered<T extends { readonly order: number }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => left.order - right.order);
}

export function resolveApplicationView(
  registry: PluginRegistry,
  selection: ReturnType<ReturnType<typeof createNavigationController>["selection"]>,
): ApplicationView | undefined {
  const matches = ordered(registry.extensions(viewResolvers))
    .map((resolver) => resolver.resolve(selection))
    .filter((view) => view !== undefined);
  if (matches.length > 1) {
    throw new Error(`Navigation route is handled by multiple views: ${matches.map((view) => view.id).join(", ")}`);
  }
  return matches[0];
}

function ProviderChain(props: { registry: PluginRegistry; children: JSX.Element }) {
  const providers = ordered(props.registry.extensions(applicationProviders));
  const render = (index: number): JSX.Element => {
    const provider = providers[index];
    return provider ? <Dynamic component={provider.component}>{render(index + 1)}</Dynamic> : props.children;
  };
  return render(0);
}

function ShellContent(props: { registry: PluginRegistry; user: AuthenticatedUser; onLogout: () => Promise<void> }) {
  const navigation = useNavigation();
  const [navigationOpen, setNavigationOpen] = createSignal(false);
  const [sidebarWidth, setSidebarWidth] = createSignal(Number(localStorage.getItem("joi.sidebar.width")) || 244);
  const sections = ordered(props.registry.extensions(navigationSections));
  const overlays = ordered(props.registry.extensions(shellOverlays));
  const topBar = ordered(props.registry.extensions(topBarContributions));
  const selectedView = createMemo(() => resolveApplicationView(props.registry, navigation.selection()));
  const startResize = (event: PointerEvent) => {
    const origin = event.clientX;
    const width = sidebarWidth();
    const move = (moveEvent: PointerEvent) => {
      const next = Math.min(380, Math.max(200, width + moveEvent.clientX - origin));
      setSidebarWidth(next);
      localStorage.setItem("joi.sidebar.width", String(next));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  return (
    <div class={styles.appShell} style={{ "--sidebar-width": `${sidebarWidth()}px` }}>
      <header class={styles.topBar}>
        <div class={styles.topBarStart}>
          <IconButton
            class={styles.mobileNavigationButton}
            label="Open navigation"
            icon="☰"
            onClick={() => setNavigationOpen(true)}
          />
          <a class={styles.brand} href="/" aria-label="Joi home">
            Joi
          </a>
          <span class={styles.topDivider} />
          <span class={styles.currentView}>{selectedView()?.name ?? "Workspace"}</span>
        </div>
        <div class={styles.topCommands}>
          <For each={topBar}>{(contribution) => <Dynamic component={contribution.component} />}</For>
          <UserMenu user={props.user} onLogout={props.onLogout} />
        </div>
      </header>
      <Show when={navigationOpen()}>
        <button
          class={styles.navigationBackdrop}
          aria-label="Close navigation"
          onClick={() => setNavigationOpen(false)}
        />
      </Show>
      <div class={styles.workspaceLayout}>
        <aside
          class={`${styles.navigationPanel} ${navigationOpen() ? styles.navigationPanelOpen : ""}`}
          aria-label="Workspace navigation"
        >
          <For each={sections}>{(section) => <Dynamic component={section.component} />}</For>
          <button
            class={styles.sidebarResizer}
            aria-label="Resize navigation"
            aria-orientation="vertical"
            onPointerDown={startResize}
          />
        </aside>
        <ViewContent view={selectedView()} />
      </div>
      <StatusBar registry={props.registry} />
      <For each={overlays}>{(overlay) => <Dynamic component={overlay.component} />}</For>
    </div>
  );
}

export function ApplicationShell(props: {
  registry: PluginRegistry;
  services: ApplicationServices;
  user: AuthenticatedUser;
  onLogout: () => Promise<void>;
}) {
  const navigation = createNavigationController();
  return (
    <ApplicationServicesProvider services={props.services}>
      <ContextMenuProvider>
        <ActionProvider registry={props.registry} currentUser={props.user}>
          <ActionQuickLauncher />
          <PluginRegistryProvider registry={props.registry}>
            <LookupProvider registry={props.registry}>
              <EntityRegistryProvider pluginRegistry={props.registry}>
                <NavigationProvider controller={navigation}>
                  <ProviderChain registry={props.registry}>
                    <ShellContent registry={props.registry} user={props.user} onLogout={props.onLogout} />
                  </ProviderChain>
                </NavigationProvider>
              </EntityRegistryProvider>
            </LookupProvider>
          </PluginRegistryProvider>
        </ActionProvider>
      </ContextMenuProvider>
    </ApplicationServicesProvider>
  );
}
