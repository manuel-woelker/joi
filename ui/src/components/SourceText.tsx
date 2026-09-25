import type { ParentProps } from "solid-js";

import styles from "./SourceText.module.css";

export function DataText(props: ParentProps) {
  return <span class={styles.data}>{props.children}</span>;
}

export function ModelText(props: ParentProps) {
  return <span class={styles.model}>{props.children}</span>;
}

export function FilterText(props: ParentProps) {
  return <span class={styles.filter}>{props.children}</span>;
}
