import type { ComponentProps } from "solid-js";
import styles from "./IconButton.module.css";

interface IconButtonProps extends ComponentProps<"button"> {
  label: string;
  icon: string;
}

export function IconButton(props: IconButtonProps) {
  return (
    <button
      {...props}
      class={`${styles.iconButton} ${props.class ?? ""}`}
      aria-label={props.label}
      data-tooltip={props.label}
    >
      <span class={styles.iconGlyph} aria-hidden="true">
        {props.icon}
      </span>
    </button>
  );
}
