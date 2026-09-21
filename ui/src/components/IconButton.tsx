import { type ComponentProps, type JSX, splitProps } from "solid-js";
import styles from "./IconButton.module.css";

interface IconButtonProps extends ComponentProps<"button"> {
  label: string;
  icon: JSX.Element;
  /** Optional visible text next to the icon; falls back to icon-only with a tooltip. */
  text?: string;
}

export function IconButton(props: IconButtonProps) {
  const [local, buttonProps] = splitProps(props, ["label", "icon", "text", "class"]);
  return (
    <button
      {...buttonProps}
      class={`${styles.iconButton} ${local.text ? styles.labeled : ""} ${local.class ?? ""}`}
      aria-label={local.label}
      data-tooltip={local.text ? undefined : local.label}
    >
      <span class={styles.iconGlyph} aria-hidden="true">
        {local.icon}
      </span>
      {local.text ? <span class={styles.buttonText}>{local.text}</span> : null}
    </button>
  );
}
