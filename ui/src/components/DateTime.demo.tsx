import type { ComponentDemo } from "../plugins/core/playground/demo";
import { DateTime } from "./DateTime";

export default {
  name: "Date Time",
  description: "Displays a human relative time, adding the full local timestamp when there is room for it.",
  scenarios: [
    {
      name: "Commit timestamp",
      description: "Renders a recent commit timestamp as seen in the git history and commit review views.",
      render: () => <DateTime value={new Date(Date.now() - 2 * 3_600_000).toISOString()} />,
    },
    {
      name: "Constrained width",
      description: "Collapses to the relative time alone when the absolute timestamp does not fit.",
      render: () => (
        <div style={{ width: "140px", padding: "8px", border: "1px dashed var(--color-border)" }}>
          <DateTime value={new Date(Date.now() - 2 * 3_600_000).toISOString()} />
        </div>
      ),
    },
    {
      name: "Multiple timestamps",
      description: "Shows several timestamps in dense layouts, useful for activity feeds and tables.",
      render: () => (
        <div style={{ display: "flex", gap: "16px", "flex-wrap": "wrap" }}>
          <DateTime value={new Date(Date.now() - 5 * 60_000).toISOString()} />
          <DateTime value={new Date(Date.now() - 26 * 3_600_000).toISOString()} />
          <DateTime value={new Date(Date.now() - 4 * 86_400_000).toISOString()} />
        </div>
      ),
    },
    {
      name: "Custom formatting",
      description: "Accepts Date objects and numeric timestamps in addition to ISO strings.",
      render: () => (
        <div style={{ display: "flex", gap: "16px", "flex-wrap": "wrap" }}>
          <DateTime value={new Date(Date.now() - 2 * 3_600_000)} />
          <DateTime value={Date.now() - 3 * 86_400_000} />
        </div>
      ),
    },
  ],
} satisfies ComponentDemo;
