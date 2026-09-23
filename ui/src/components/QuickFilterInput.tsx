import Trash2Icon from "lucide-solid/icons/trash-2";
import { createEffect, Show, type JSX } from "solid-js";

import styles from "./QuickFilterInput.module.css";

/** A controlled quicksearch input with a clear command. */
export function QuickFilterInput(props: {
  value: () => string;
  onInput: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  density?: "compact" | "regular";
  leadingIcon?: JSX.Element;
  class?: string;
}) {
  let input!: HTMLInputElement;

  // Preserve the caret on local input while still accepting external resets.
  createEffect(() => {
    const value = props.value();
    if (input.value !== value) input.value = value;
  });

  return (
    <div class={`${styles.field} ${props.density === "compact" ? styles.compact : ""} ${props.class ?? ""}`}>
      <Show when={props.leadingIcon}>
        <span class={styles.leadingIcon} aria-hidden="true">
          {props.leadingIcon}
        </span>
      </Show>
      <input
        ref={input}
        type="search"
        aria-label={props.ariaLabel}
        placeholder={props.placeholder}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
            event.stopPropagation();
          }
        }}
      />
      <Show when={props.value()}>
        <button
          type="button"
          class={styles.clear}
          aria-label={`Clear ${props.ariaLabel}`}
          data-tooltip={`Clear ${props.ariaLabel}`}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            props.onInput("");
            input.focus();
          }}
        >
          <Trash2Icon size={14} aria-hidden="true" />
        </button>
      </Show>
    </div>
  );
}
