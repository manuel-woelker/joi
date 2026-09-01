import { Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { ActionCommands } from "../actions/ActionCommands";
import type { ApplicationView } from "../views/view";
import styles from "./ViewContent.module.css";

export function ViewContent(props: { view?: ApplicationView }) {
  return (
    <main class={styles.workspaceMain}>
      <Show
        when={props.view}
        fallback={
          <div class={styles.emptyState}>
            <h1>No view selected</h1>
            <p>Create or select a saved view from the navigation.</p>
          </div>
        }
      >
        {(view) => (
          <>
            <div class={styles.viewHeading}>
              <div>
                <p class={styles.eyebrow}>{view().section}</p>
                <div class={styles.title}>
                  <Show when={view().icon}>
                    {(Icon) => <Dynamic component={Icon()} size={25} aria-hidden="true" />}
                  </Show>
                  <h1>{view().name}</h1>
                </div>
                <Show when={view().description}>{(description) => <p>{description()}</p>}</Show>
              </div>
              <div class={styles.headingCommands}>
                <Show when={view().commands}>{(Commands) => <Dynamic component={Commands()} />}</Show>
                <ActionCommands />
              </div>
            </div>
            <Dynamic component={view().content} />
          </>
        )}
      </Show>
    </main>
  );
}
