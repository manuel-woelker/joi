import { createUniqueId, For, Show, type JSX } from "solid-js";

import styles from "./Tabs.module.css";

export interface TabDefinition {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly render: () => JSX.Element;
}

export interface TabsProps {
  readonly class?: string;
  readonly ariaLabel: string;
  readonly tabs: readonly TabDefinition[];
  readonly selected: string;
  readonly onSelect: (id: string) => void;
}

/** Renders a controlled, keyboard-accessible tab list and its selected panel. */
export function Tabs(props: TabsProps) {
  const instanceId = createUniqueId();
  const tabElements = new Map<string, HTMLButtonElement>();
  const selectedTab = () => props.tabs.find((tab) => tab.id === props.selected && !tab.disabled);
  const select = (tab: TabDefinition) => {
    if (tab.disabled) return;
    props.onSelect(tab.id);
    tabElements.get(tab.id)?.focus();
  };
  const moveSelection = (direction: -1 | 1) => {
    const enabled = props.tabs.filter((tab) => !tab.disabled);
    if (!enabled.length) return;
    const selectedIndex = enabled.findIndex((tab) => tab.id === props.selected);
    const nextIndex = selectedIndex < 0 ? 0 : (selectedIndex + direction + enabled.length) % enabled.length;
    select(enabled[nextIndex]);
  };
  const selectEdge = (edge: "first" | "last") => {
    const enabled = props.tabs.filter((tab) => !tab.disabled);
    const tab = edge === "first" ? enabled[0] : enabled.at(-1);
    if (tab) select(tab);
  };
  const tabId = (id: string) => `${instanceId}-tab-${id}`;
  const panelId = (id: string) => `${instanceId}-panel-${id}`;

  return (
    <div class={`${styles.tabs} ${props.class ?? ""}`}>
      <div class={styles.tabList} role="tablist" aria-label={props.ariaLabel}>
        <For each={props.tabs}>
          {(tab) => (
            <button
              ref={(element) => tabElements.set(tab.id, element)}
              id={tabId(tab.id)}
              type="button"
              role="tab"
              aria-selected={tab.id === props.selected}
              aria-controls={panelId(tab.id)}
              disabled={tab.disabled}
              tabIndex={tab.id === props.selected ? 0 : -1}
              onClick={() => select(tab)}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") moveSelection(-1);
                else if (event.key === "ArrowRight") moveSelection(1);
                else if (event.key === "Home") selectEdge("first");
                else if (event.key === "End") selectEdge("last");
                else return;
                event.preventDefault();
              }}
            >
              {tab.label}
            </button>
          )}
        </For>
      </div>
      <Show when={selectedTab()}>
        {(tab) => (
          <div
            id={panelId(tab().id)}
            class={styles.tabPanel}
            role="tabpanel"
            aria-labelledby={tabId(tab().id)}
            tabIndex={0}
          >
            {tab().render()}
          </div>
        )}
      </Show>
    </div>
  );
}
