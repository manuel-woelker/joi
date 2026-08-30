import { createSignal } from "solid-js";

import type { ComponentDemo } from "../playground/demo";
import { IconButton } from "./IconButton";

function InteractiveIconButton() {
  const [count, setCount] = createSignal(0);
  return (
    <div style={{ display: "flex", "align-items": "center", gap: "10px" }}>
      <IconButton label="Add item" icon="+" onClick={() => setCount((value) => value + 1)} />
      <span>Added {count()} times</span>
    </div>
  );
}

export default {
  name: "Icon Button",
  description: "A compact command button with an accessible label and custom tooltip.",
  scenarios: [
    { name: "Disabled", render: () => <IconButton label="Delete item" icon="×" disabled /> },
    { name: "Interactive", render: () => <InteractiveIconButton /> },
  ],
} satisfies ComponentDemo;
