import { createSignal, Show } from "solid-js";
import type { ComponentDemo } from "../plugins/core/playground/demo";
import { CloseButton } from "./CloseButton";

function PanelScenario() {
  const [open, setOpen] = createSignal(true);
  return (
    <Show
      when={open()}
      fallback={
        <button type="button" onClick={() => setOpen(true)}>
          Reopen panel
        </button>
      }
    >
      <div
        style={{ display: "flex", "align-items": "center", "justify-content": "space-between", "max-width": "360px" }}
      >
        <span>Details</span>
        <CloseButton label="Close details" onClick={() => setOpen(false)} />
      </div>
    </Show>
  );
}

export default {
  name: "Close Button",
  description: "Borderless close controls for panels and detail views.",
  scenarios: [
    { name: "Panel header", render: PanelScenario },
    { name: "Disabled", render: () => <CloseButton label="Close panel" disabled onClick={() => undefined} /> },
  ],
} satisfies ComponentDemo;
