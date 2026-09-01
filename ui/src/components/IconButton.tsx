import { type ComponentProps, type JSX, splitProps } from "solid-js";
import styles from "./IconButton.module.css";

interface IconButtonProps extends ComponentProps<"button"> {
  label: string;
  icon: JSX.Element;
}

export function IconButton(props: IconButtonProps) {
  const [local, buttonProps] = splitProps(props, ["label", "icon", "class"]);
  return (
    <button
      {...buttonProps}
      class={`${styles.iconButton} ${local.class ?? ""}`}
      aria-label={local.label}
      data-tooltip={local.label}
    >
      <span class={styles.iconGlyph} aria-hidden="true">
        {local.icon}
      </span>
    </button>
  );
}
