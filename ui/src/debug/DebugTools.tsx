import { For, Show, createSignal } from "solid-js";
import { Dynamic } from "solid-js/web";

import type { PluginRegistry } from "../plugins/registry";
import { debugContributions, type DebugContribution } from "./contribution";

export interface DebugToolsProps {
  registry: PluginRegistry;
}

export function DebugTools(props: DebugToolsProps) {
  const contributions = props.registry.extensions(debugContributions);
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal<DebugContribution>(contributions[0]);

  const toggle = () => {
    setOpen((current) => !current);
    if (!active()) setActive(() => contributions[0]);
  };

  return (
    <div class="debug-tools">
      <Show when={open()}>
        <aside class="debug-panel" aria-label="Debug tools">
          <header><h2>Debug</h2><button class="debug-close" aria-label="Close debug panel" onClick={() => setOpen(false)}>&times;</button></header>
          <div class="debug-workspace">
            <nav class="debug-master" aria-label="Debug contributions">
              <For each={contributions}>
                {(contribution) => (
                  <button
                    classList={{ active: active()?.id === contribution.id }}
                    aria-current={active()?.id === contribution.id ? "page" : undefined}
                    onClick={() => setActive(() => contribution)}
                  >{contribution.name}</button>
                )}
              </For>
            </nav>
            <Show when={active()}>
              {(contribution) => (
                <section class="debug-detail" aria-labelledby="debug-detail-heading">
                  <h3 id="debug-detail-heading">{contribution().name}</h3>
                  <div class="debug-panel-content"><Dynamic component={contribution().content} pluginRegistry={props.registry} /></div>
                </section>
              )}
            </Show>
          </div>
        </aside>
      </Show>
      <button
        class="debug-trigger"
        aria-label="Open debug tools"
        aria-expanded={open()}
        onClick={toggle}
      ><span aria-hidden="true">&#x2299;</span></button>
    </div>
  );
}
