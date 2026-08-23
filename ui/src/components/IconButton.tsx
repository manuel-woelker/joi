import type { Component, ComponentProps } from "solid-js";

interface IconButtonProps extends ComponentProps<"button"> {
  label: string;
  icon: Component<{ size?: number; "aria-hidden"?: boolean }>;
}

export function IconButton(props: IconButtonProps) {
  const Icon = props.icon;
  return (
    <button {...props} class={`icon-button ${props.class ?? ""}`} aria-label={props.label} data-tooltip={props.label}>
      <Icon size={17} aria-hidden={true} />
    </button>
  );
}
