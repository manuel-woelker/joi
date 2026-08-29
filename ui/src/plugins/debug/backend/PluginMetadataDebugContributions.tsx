import { createResource, For, Match, Switch, type JSX, type Resource } from "solid-js";

import type { BackendPluginsService, PluginsResponse } from "./plugins-api";
import styles from "./PluginMetadataDebugContributions.module.css";

export function ExtensionPointsDebugContribution(props: { backendPluginsService: BackendPluginsService }) {
  const [metadata] = createResource(() => props.backendPluginsService.load());
  return (
    <PluginMetadataResource metadata={metadata} content={(value) => <ExtensionPointsMetadata metadata={value} />} />
  );
}

export function PluginsDebugContribution(props: { backendPluginsService: BackendPluginsService }) {
  const [metadata] = createResource(() => props.backendPluginsService.load());
  return <PluginMetadataResource metadata={metadata} content={(value) => <PluginsMetadata metadata={value} />} />;
}

export function PluginsMetadata(props: { metadata: PluginsResponse }) {
  return (
    <ul class={styles.debugMetadataList}>
      <For each={props.metadata.plugins}>
        {(plugin) => (
          <li>
            <div>
              <strong>{plugin.name}</strong>
              <span>{plugin.description}</span>
            </div>
            <dl>
              <dt>Extension points:</dt>
              <dd>{plugin.extension_points.join(", ") || "None"}</dd>
              <dt>Extensions:</dt>
              <dd>{plugin.extensions.join(", ") || "None"}</dd>
            </dl>
          </li>
        )}
      </For>
    </ul>
  );
}

export function ExtensionPointsMetadata(props: { metadata: PluginsResponse }) {
  return (
    <ul class={styles.debugMetadataList}>
      <For each={props.metadata.extension_points}>
        {(point) => {
          const owner = props.metadata.plugins.find((plugin) => plugin.extension_points.includes(point.id));
          return (
            <li>
              <div>
                <div class={styles.debugMetadataTitle}>
                  <strong>{point.id}</strong>
                  <small>{owner?.name ?? "unknown plugin"}</small>
                </div>
                <span>{point.description}</span>
              </div>
              <ul class={styles.debugNestedExtensions}>
                <For each={point.extensions}>
                  {(extensionId) => {
                    const extension = props.metadata.extensions.find((candidate) => candidate.id === extensionId);
                    const extensionOwner = props.metadata.plugins.find((plugin) =>
                      plugin.extensions.includes(extensionId),
                    );
                    return (
                      <li>
                        <div class={styles.debugMetadataTitle}>
                          <strong>{extensionId}</strong>
                          <small>{extensionOwner?.name ?? "unknown plugin"}</small>
                        </div>
                        <span>{extension?.description ?? "No description"}</span>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </li>
          );
        }}
      </For>
    </ul>
  );
}

interface PluginMetadataResourceProps {
  metadata: Resource<PluginsResponse>;
  content: (metadata: PluginsResponse) => JSX.Element;
}

function PluginMetadataResource(props: PluginMetadataResourceProps) {
  return (
    <Switch>
      <Match when={props.metadata.error}>
        <p class={styles.debugError} role="alert">
          {props.metadata.error.message}
        </p>
      </Match>
      <Match when={props.metadata.loading}>
        <p class={styles.debugLoading}>Loading plugin metadata...</p>
      </Match>
      <Match when={props.metadata()}>{(metadata) => props.content(metadata())}</Match>
    </Switch>
  );
}
