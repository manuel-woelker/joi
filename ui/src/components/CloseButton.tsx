import XIcon from "lucide-solid/icons/x";
import { IconButton } from "./IconButton";

/** Borderless close control with an accessible label and the shared icon-button tooltip. */
export function CloseButton(props: { onClick: () => void; label?: string; disabled?: boolean }) {
  return (
    <IconButton
      type="button"
      label={props.label ?? "Close"}
      icon={<XIcon size={16} />}
      onClick={props.onClick}
      disabled={props.disabled}
    />
  );
}
