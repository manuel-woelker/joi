import { splitProps, type ComponentProps } from "solid-js";

import styles from "./Badge.module.css";

export interface BadgeProps extends ComponentProps<"span"> {
  readonly tone?: "neutral" | "primary" | "success" | "warning" | "danger";
  readonly size?: "compact" | "default";
}

export function Badge(props: BadgeProps) {
  const [local, rest] = splitProps(props, ["class", "tone", "size"]);
  return (
    <span
      {...rest}
      class={`${styles.badge} ${local.class ?? ""}`}
      data-tone={local.tone ?? "neutral"}
      data-size={local.size ?? "default"}
    />
  );
}
