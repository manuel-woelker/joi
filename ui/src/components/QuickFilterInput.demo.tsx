import { createSignal } from "solid-js";

import type { ComponentDemo } from "../plugins/core/playground/demo";
import { QuickFilterInput } from "./QuickFilterInput";

function RegularInput() {
  const [value, setValue] = createSignal("navigation");
  return (
    <div style={{ width: "340px" }}>
      <QuickFilterInput
        value={value}
        onInput={setValue}
        ariaLabel="Search tickets"
        placeholder="Search tickets"
        leadingIcon="⌕"
      />
    </div>
  );
}

function CompactInput() {
  const [value, setValue] = createSignal("owner");
  return (
    <div style={{ width: "220px" }}>
      <QuickFilterInput
        value={value}
        onInput={setValue}
        ariaLabel="Filter Name"
        placeholder="Filter Name"
        density="compact"
      />
    </div>
  );
}

export default {
  name: "Quick filter input",
  description: "Controlled search input with an explicit clear control.",
  scenarios: [
    { name: "Search", description: "Toolbar search field.", render: RegularInput },
    { name: "Column filter", description: "Compact table filter field.", render: CompactInput },
  ],
} satisfies ComponentDemo;
