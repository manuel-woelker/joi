import { Show, createSignal, onCleanup, onMount } from "solid-js";

import type { AuthenticatedUser } from "./authentication-service";
import styles from "./UserMenu.module.css";

export function UserMenu(props: { user: AuthenticatedUser; onLogout: () => void | Promise<void> }) {
  const [open, setOpen] = createSignal(false);
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string>();
  let menuElement: HTMLDivElement | undefined;
  const closeFromOutside = (event: MouseEvent) => {
    if (!menuElement?.contains(event.target as Node)) setOpen(false);
  };
  onMount(() => document.addEventListener("click", closeFromOutside));
  onCleanup(() => document.removeEventListener("click", closeFromOutside));
  const performLogout = async () => {
    if (pending()) return;
    setPending(true);
    setError(undefined);
    try {
      await props.onLogout();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPending(false);
    }
  };
  return (
    <div
      ref={menuElement}
      class={styles.userMenu}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        class={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open()}
        onClick={() => setOpen((value) => !value)}
      >
        {props.user.name}
        <span aria-hidden="true">⌄</span>
      </button>
      <Show when={open()}>
        <div class={styles.menu} role="menu">
          <div class={styles.identity}>
            <strong>{props.user.name}</strong>
            <span>{props.user.username}</span>
          </div>
          <button type="button" role="menuitem" disabled={pending()} onClick={() => void performLogout()}>
            {pending() ? "Logging out..." : "Logout"}
          </button>
          <Show when={error()}>{(message) => <p role="alert">{message()}</p>}</Show>
        </div>
      </Show>
    </div>
  );
}
