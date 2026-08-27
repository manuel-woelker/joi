import { For, Match, Switch, createResource } from "solid-js";

import { loadInfo } from "./info-api";

export function InfoDebugContribution() {
  const [info] = createResource(() => loadInfo());

  return (
    <Switch>
      <Match when={info.error}>
        <p class="debug-error" role="alert">{info.error.message}</p>
      </Match>
      <Match when={info.loading}>
        <p class="debug-loading">Loading information...</p>
      </Match>
      <Match when={info()}>
        {(values) => (
          <dl class="debug-info-list">
            <For each={Object.entries(values())}>
              {([key, value]) => <><dt>{key.replaceAll("_", " ")}</dt><dd>{String(value)}</dd></>}
            </For>
          </dl>
        )}
      </Match>
    </Switch>
  );
}
