import { For } from "solid-js";
import { Dynamic } from "solid-js/web";

import type { RegisteredExtensionEntry } from "../../../base/plugin-registry";
import { InspectableExtension, InspectableExtensionPoint } from "../debug/inspector/extension-inspector";
import { statusBarContributions, type StatusBarContribution } from "./contribution";
import styles from "./StatusBar.module.css";

export function StatusBar(props: { registry: import("../../../base/plugin-registry").PluginRegistry }) {
  const contributions = [...props.registry.extensionEntries(statusBarContributions)].sort(
    (left, right) => left.value.order - right.value.order,
  );
  const left = contributions.filter((contribution) => contribution.value.order < 0);
  const right = contributions.filter((contribution) => contribution.value.order >= 0);
  return (
    <footer class={styles.statusBar}>
      <InspectableExtensionPoint id={statusBarContributions.id}>
        <StatusBarSide contributions={left} side="left" />
        <StatusBarSide contributions={right} side="right" />
      </InspectableExtensionPoint>
    </footer>
  );
}

function StatusBarSide(props: {
  contributions: RegisteredExtensionEntry<StatusBarContribution>[];
  side: "left" | "right";
}) {
  return (
    <div class={`${styles.side} ${styles[props.side]}`}>
      <For each={props.contributions}>
        {(entry) => (
          <InspectableExtension id={entry.id}>
            <Dynamic component={entry.value.content} />
          </InspectableExtension>
        )}
      </For>
    </div>
  );
}
