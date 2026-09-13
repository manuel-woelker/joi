import { ErrorBoundary, Show, createSignal, onCleanup } from "solid-js";

import App from "./App";
import { ApplicationFailure } from "./components/ApplicationFailure";
import { PlaygroundApp } from "./plugins/core/playground/PlaygroundApp";
import { isPlaygroundHash } from "./plugins/core/playground/playground-route";

export function Root() {
  const [hash, setHash] = createSignal(window.location.hash);
  const onHashChange = () => setHash(window.location.hash);
  window.addEventListener("hashchange", onHashChange);
  onCleanup(() => window.removeEventListener("hashchange", onHashChange));

  return (
    <ErrorBoundary fallback={(error, reset) => <ApplicationFailure error={error} onRetry={reset} />}>
      <Show when={isPlaygroundHash(hash())} fallback={<App />}>
        <PlaygroundApp />
      </Show>
    </ErrorBoundary>
  );
}
