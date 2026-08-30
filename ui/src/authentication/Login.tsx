import { For, Show, createResource, createSignal } from "solid-js";

import type { FetchService } from "../services/fetch-service";
import { loadLoginUsers, login, type AuthenticatedUser } from "./authentication-service";
import styles from "./Login.module.css";

export function Login(props: { fetchService: FetchService; onLogin: (user: AuthenticatedUser) => void }) {
  const [users, { refetch }] = createResource(() => loadLoginUsers(props.fetchService));
  const [selectedUserId, setSelectedUserId] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!selectedUserId() || submitting()) return;
    setSubmitting(true);
    setError(undefined);
    try {
      props.onLogin(await login(props.fetchService, selectedUserId()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main class={styles.page}>
      <form class={styles.login} onSubmit={submit}>
        <div class={styles.brand}>Joi</div>
        <h1>Sign in</h1>
        <Show when={!users.loading} fallback={<p class={styles.status}>Loading users...</p>}>
          <Show
            when={!users.error}
            fallback={
              <div class={styles.error} role="alert">
                <span>Users could not be loaded.</span>
                <button type="button" onClick={() => void refetch()}>
                  Retry
                </button>
              </div>
            }
          >
            <label for="login-user">User</label>
            <select
              id="login-user"
              value={selectedUserId()}
              onChange={(event) => setSelectedUserId(event.currentTarget.value)}
            >
              <option value="" disabled>
                Select a user
              </option>
              <For each={users()}>
                {(user) => (
                  <option value={user.id}>
                    {user.name} ({user.username})
                  </option>
                )}
              </For>
            </select>
            <Show when={error()}>
              {(message) => (
                <p class={styles.error} role="alert">
                  {message()}
                </p>
              )}
            </Show>
            <button class={styles.submit} type="submit" disabled={!selectedUserId() || submitting()}>
              {submitting() ? "Signing in..." : "Continue"}
            </button>
          </Show>
        </Show>
      </form>
    </main>
  );
}
