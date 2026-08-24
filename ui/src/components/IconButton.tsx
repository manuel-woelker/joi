import type { ComponentProps } from "solid-js";

interface IconButtonProps extends ComponentProps<"button"> {
  label: string;
  icon: string;
}

export function IconButton(props: IconButtonProps) {
  return (
    <button {...props} class={`icon-button ${props.class ?? ""}`} aria-label={props.label} data-tooltip={props.label}>
      <span class="icon-glyph" aria-hidden="true">{props.icon}</span>
    </button>
  );
}
