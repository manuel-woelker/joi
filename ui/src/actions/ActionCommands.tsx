import { For, Show } from "solid-js";
import styles from "./ActionCommands.module.css";
import { useActions } from "./ActionProvider";

export function ActionCommands() {
  const actions = useActions();
  return (
    <div class={styles.commands}>
      <Show when={actions.error()}>
        {(error) => (
          <span class={styles.error} role="alert">
            {error().message}
          </span>
        )}
      </Show>
      <For each={actions.availableActions().filter((action) => action.showInActionBar !== false)}>
        {(action) => (
          <button
            type="button"
            class={styles.action}
            disabled={Boolean(actions.pendingAction())}
            aria-describedby={`${action.id}-description`}
            onClick={() => void actions.execute(action)}
          >
            {action.label}
            <Show when={action.hotkey}>{(hotkey) => <span class={styles.hotkey}>{hotkey()}</span>}</Show>
            <span id={`${action.id}-description`} role="tooltip" class={styles.tooltip}>
              {action.description}
              <Show when={action.hotkey}>{(hotkey) => ` Hotkey: ${hotkey()}.`}</Show>
            </span>
          </button>
        )}
      </For>
    </div>
  );
}
