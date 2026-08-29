import { createResource, For, Match, Switch } from "solid-js";

import type { BackendInfoService } from "./info-api";
import styles from "./InfoDebugContribution.module.css";

export function InfoDebugContribution(props: { backendInfoService: BackendInfoService }) {
  const [info] = createResource(() => props.backendInfoService.load());

  return (
    <Switch>
      <Match when={info.error}>
        <p class={styles.debugError} role="alert">
          {info.error.message}
        </p>
      </Match>
      <Match when={info.loading}>
        <p class={styles.debugLoading}>Loading information...</p>
      </Match>
      <Match when={info()}>
        {(values) => (
          <dl class={styles.debugInfoList}>
            <For each={Object.entries(values())}>
              {([key, value]) => (
                <>
                  <dt>{key.replaceAll("_", " ")}</dt>
                  <dd>{String(value)}</dd>
                </>
              )}
            </For>
          </dl>
        )}
      </Match>
    </Switch>
  );
}
