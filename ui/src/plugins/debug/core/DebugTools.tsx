import { For, Show, createSignal } from "solid-js";
import { Dynamic } from "solid-js/web";

import type { PluginRegistryService } from "../../plugin-registry-service";
import { debugContributions, type DebugContribution } from "./contribution";
import styles from "./DebugTools.module.css";

export interface DebugToolsProps {
  registry: PluginRegistryService;
}

export function DebugTools(props: DebugToolsProps) {
  const groupOrder = ["info", "frontend", "backend"] as const;
  const contributions = [...props.registry.extensions(debugContributions)].sort((left, right) => {
    const groupDifference = groupOrder.indexOf(left.group) - groupOrder.indexOf(right.group);
    return groupDifference || left.name.localeCompare(right.name);
  });
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal<DebugContribution>(contributions[0]);

  const toggle = () => {
    setOpen((current) => !current);
    if (!active()) setActive(() => contributions[0]);
  };

  return (
    <div class={styles.debugTools}>
      <Show when={open()}>
        <aside class={styles.debugPanel} aria-label="Debug tools">
          <header>
            <h2>Debug</h2>
            <button class={styles.debugClose} aria-label="Close debug panel" onClick={() => setOpen(false)}>
              &times;
            </button>
          </header>
          <div class={styles.debugWorkspace}>
            <nav class={styles.debugMaster} aria-label="Debug contributions">
              <For each={contributions}>
                {(contribution) => (
                  <button
                    classList={{ [styles.active]: active()?.id === contribution.id }}
                    aria-current={active()?.id === contribution.id ? "page" : undefined}
                    onClick={() => setActive(() => contribution)}
                  >
                    {contribution.name}
                  </button>
                )}
              </For>
            </nav>
            <Show when={active()}>
              {(contribution) => (
                <section class={styles.debugDetail} aria-labelledby="debug-detail-heading">
                  <h3 id="debug-detail-heading">{contribution().name}</h3>
                  <div class={styles.debugPanelContent}>
                    <Dynamic component={contribution().content} />
                  </div>
                </section>
              )}
            </Show>
          </div>
        </aside>
      </Show>
      <button class={styles.debugTrigger} aria-label="Open debug tools" aria-expanded={open()} onClick={toggle}>
        <span aria-hidden="true">&#x2299;</span>
      </button>
    </div>
  );
}
