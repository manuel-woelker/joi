import { createResource, For, Match, Switch } from "solid-js";

import type { BackendInfoService } from "./info-api";

export function InfoDebugContribution(props: { backendInfoService: BackendInfoService }) {
  const [info] = createResource(() => props.backendInfoService.load());

  return (
    <Switch>
      <Match when={info.error}>
        <p class="debug-error" role="alert">
          {info.error.message}
        </p>
      </Match>
      <Match when={info.loading}>
        <p class="debug-loading">Loading information...</p>
      </Match>
      <Match when={info()}>
        {(values) => (
          <dl class="debug-info-list">
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
