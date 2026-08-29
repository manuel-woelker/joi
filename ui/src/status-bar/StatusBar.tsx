import { For } from "solid-js";
import { Dynamic } from "solid-js/web";

import { statusBarContributions, type StatusBarContribution } from "./contribution";
import styles from "./StatusBar.module.css";

export function StatusBar(props: { registry: import("../plugins/registry").PluginRegistry }) {
  const contributions = [...props.registry.extensions(statusBarContributions)].sort(
    (left, right) => left.order - right.order,
  );
  const left = contributions.filter((contribution) => contribution.order < 0);
  const right = contributions.filter((contribution) => contribution.order >= 0);
  return (
    <footer class={styles.statusBar}>
      <StatusBarSide contributions={left} side="left" />
      <StatusBarSide contributions={right} side="right" />
    </footer>
  );
}

function StatusBarSide(props: { contributions: StatusBarContribution[]; side: "left" | "right" }) {
  return (
    <div class={`${styles.side} ${styles[props.side]}`}>
      <For each={props.contributions}>{(contribution) => <Dynamic component={contribution.content} />}</For>
    </div>
  );
}
