import { Show, createSignal, onCleanup } from "solid-js";

import App from "./App";
import { PlaygroundApp } from "./playground/PlaygroundApp";
import { isPlaygroundHash } from "./playground/playground-route";

export function Root() {
  const [hash, setHash] = createSignal(window.location.hash);
  const onHashChange = () => setHash(window.location.hash);
  window.addEventListener("hashchange", onHashChange);
  onCleanup(() => window.removeEventListener("hashchange", onHashChange));

  return (
    <Show when={isPlaygroundHash(hash())} fallback={<App />}>
      <PlaygroundApp />
    </Show>
  );
}
