import type { ComponentDemo } from "../plugins/core/playground/demo";
import { DateTime } from "./DateTime";

export default {
  name: "Date Time",
  description: "Displays a timestamp in ISO8601 format in the user's local timezone.",
  scenarios: [
    {
      name: "Commit timestamp",
      description: "Renders a recent commit timestamp as seen in the git history and commit review views.",
      render: () => <DateTime value="2026-09-19T16:40:44Z" />,
    },
    {
      name: "Multiple timestamps",
      description: "Shows several timestamps in dense layouts, useful for activity feeds and tables.",
      render: () => (
        <div style={{ display: "flex", gap: "16px", "flex-wrap": "wrap" }}>
          <DateTime value="2026-09-19T16:40:44Z" />
          <DateTime value="2026-09-18T08:15:00Z" />
          <DateTime value="2026-09-17T22:30:00Z" />
        </div>
      ),
    },
    {
      name: "Custom formatting",
      description: "Accepts Date objects and numeric timestamps in addition to ISO strings.",
      render: () => (
        <div style={{ display: "flex", gap: "16px", "flex-wrap": "wrap" }}>
          <DateTime value={new Date("2026-09-19T16:40:44Z")} />
          <DateTime value={1790000000000} />
        </div>
      ),
    },
  ],
} satisfies ComponentDemo;