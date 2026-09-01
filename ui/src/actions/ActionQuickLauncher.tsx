import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";

import { KeyboardShortcut } from "../components/KeyboardShortcut";
import { useActions } from "./ActionProvider";
import styles from "./ActionQuickLauncher.module.css";
import type { UiAction } from "./action";

export function ActionQuickLauncher() {
  const actions = useActions();
  const [open, setOpen] = createSignal(false);
  const [previousFocus, setPreviousFocus] = createSignal<HTMLElement>();
  const show = () => {
    if (open()) return;
    setPreviousFocus(document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
    setOpen(true);
  };
  const close = (restoreFocus = true) => {
    setOpen(false);
    const previous = previousFocus();
    if (restoreFocus && previous?.isConnected) previous.focus();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      !event.ctrlKey ||
      !event.shiftKey ||
      event.altKey ||
      event.metaKey ||
      event.key.toLocaleLowerCase() !== "a"
    )
      return;
    event.preventDefault();
    show();
  };
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  return (
    <Show keyed when={open()}>
      <ActionQuickLauncherDialog actions={actions.availableActions()} execute={actions.execute} close={close} />
    </Show>
  );
}

function ActionQuickLauncherDialog(props: {
  actions: readonly UiAction[];
  execute(action: UiAction): Promise<void>;
  close(restoreFocus?: boolean): void;
}) {
  let input: HTMLInputElement | undefined;
  const [query, setQuery] = createSignal("");
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const filteredActions = () => {
    const terms = query().trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return props.actions.filter((action) => {
      const candidate = `${action.label} ${action.description}`.toLocaleLowerCase();
      return terms.every((term) => candidate.includes(term));
    });
  };
  createEffect(() => {
    filteredActions();
    setSelectedIndex(0);
  });
  onMount(() => input?.focus());

  const run = (action: UiAction) => {
    props.close(true);
    void props.execute(action);
  };
  const onInputKeyDown = (event: KeyboardEvent) => {
    const candidates = filteredActions();
    if (event.key === "ArrowDown" && candidates.length) {
      event.preventDefault();
      setSelectedIndex((selectedIndex() + 1) % candidates.length);
    } else if (event.key === "ArrowUp" && candidates.length) {
      event.preventDefault();
      setSelectedIndex((selectedIndex() <= 0 ? candidates.length : selectedIndex()) - 1);
    } else if (event.key === "Enter") {
      const action = candidates[selectedIndex()];
      if (action) {
        event.preventDefault();
        run(action);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      props.close(true);
    }
  };
  const activeAction = () => filteredActions()[selectedIndex()];

  return (
    <Portal>
      <div class={styles.backdrop} onPointerDown={(event) => event.target === event.currentTarget && props.close(true)}>
        <section
          class={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="action-launcher-heading"
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              event.preventDefault();
              input?.focus();
            }
          }}
        >
          <header class={styles.header}>
            <h2 id="action-launcher-heading">Run action</h2>
            <KeyboardShortcut shortcut="Ctrl+Shift+A" />
          </header>
          <input
            ref={input}
            class={styles.search}
            type="search"
            role="combobox"
            aria-label="Filter actions"
            aria-controls="action-launcher-results"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-activedescendant={activeAction() ? actionOptionId(activeAction()!) : undefined}
            autocomplete="off"
            placeholder="Type an action name"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={onInputKeyDown}
          />
          <div id="action-launcher-results" class={styles.results} role="listbox" aria-label="Available actions">
            <For each={filteredActions()}>
              {(action, index) => (
                <button
                  id={actionOptionId(action)}
                  type="button"
                  class={styles.action}
                  role="option"
                  aria-selected={index() === selectedIndex()}
                  tabIndex={-1}
                  onMouseEnter={() => setSelectedIndex(index())}
                  onClick={() => run(action)}
                >
                  <span class={styles.actionText}>
                    <strong>{action.label}</strong>
                    <span>{action.description}</span>
                  </span>
                  <Show when={action.hotkey}>{(hotkey) => <KeyboardShortcut shortcut={hotkey()} />}</Show>
                </button>
              )}
            </For>
            <Show when={!filteredActions().length}>
              <p class={styles.empty}>No matching actions</p>
            </Show>
          </div>
        </section>
      </div>
    </Portal>
  );
}

function actionOptionId(action: UiAction): string {
  return `action-launcher-${action.id}`;
}
