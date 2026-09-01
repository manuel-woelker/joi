import { For, type JSX } from "solid-js";

import styles from "./KeyboardShortcut.module.css";

interface KeyboardShortcutBaseProps {
  /** Accessible description; defaults to the key labels joined with plus signs. */
  readonly ariaLabel?: string;
  readonly class?: string;
}

export type KeyboardShortcutProps = KeyboardShortcutBaseProps &
  (
    | {
        /** Shortcut notation split on plus signs, such as `Ctrl+C`. */
        readonly shortcut: string;
        readonly keys?: never;
      }
    | {
        /** Explicit key labels, useful when a key itself contains a plus sign. */
        readonly keys: readonly [string, ...string[]];
        readonly shortcut?: never;
      }
  );

/** Displays one keyboard shortcut as a sequence of semantic keycaps. */
export function KeyboardShortcut(props: KeyboardShortcutProps): JSX.Element {
  const keys = () => (props.keys ?? props.shortcut.split("+")).map((key) => key.trim());
  const accessibleLabel = () => props.ariaLabel ?? keys().join("+");
  if (keys().some((key) => !key)) throw new Error("Keyboard shortcut keys must not be blank");

  return (
    <span class={`${styles.shortcut} ${props.class ?? ""}`} role="group" aria-label={accessibleLabel()}>
      <For each={keys()}>
        {(key, index) => (
          <>
            {index() > 0 && (
              <span class={styles.separator} aria-hidden="true">
                +
              </span>
            )}
            <kbd class={styles.key} aria-hidden="true">
              {key}
            </kbd>
          </>
        )}
      </For>
    </span>
  );
}
