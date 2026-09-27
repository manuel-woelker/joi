import { createResource, Show, type ParentProps } from "solid-js";
import type { ModelService } from "./model-service";
import { EntityRegistryProvider } from "./entity-registry";

/** Mounts entity consumers only after metadata has loaded and validated successfully. */
export function ModelProvider(props: ParentProps<{ service: ModelService }>) {
  const [registry, { refetch }] = createResource(() => props.service.load());
  return (
    <Show
      when={!registry.error}
      fallback={
        <main role="alert">
          Could not load the application model: {String(registry.error)}
          <button type="button" onClick={() => void refetch()}>
            Retry
          </button>
        </main>
      }
    >
      <Show when={registry()} fallback={<main role="status">Loading application model...</main>}>
        {(loaded) => <EntityRegistryProvider registry={loaded()}>{props.children}</EntityRegistryProvider>}
      </Show>
    </Show>
  );
}
