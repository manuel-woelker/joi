import type { ComponentDemo } from "../playground/demo";
import { Badge } from "./Badge";

export default {
  name: "Badge",
  description: "Compact labels for statuses, categories, and short metadata.",
  scenarios: [
    {
      name: "Compact",
      description: "Reduced-height badges for dense tables and toolbars.",
      render: () => (
        <div style={{ display: "flex", gap: "8px" }}>
          <Badge size="compact">Draft</Badge>
          <Badge size="compact" tone="success">
            Ready
          </Badge>
        </div>
      ),
    },
    {
      name: "Long content",
      description: "Labels wrap rather than overflowing narrow containers.",
      render: () => (
        <div style={{ width: "180px" }}>
          <Badge>Awaiting dependency review</Badge>
        </div>
      ),
    },
    {
      name: "Tones",
      description: "Semantic emphasis without relying on color alone.",
      render: () => (
        <div style={{ display: "flex", "flex-wrap": "wrap", gap: "8px" }}>
          <Badge>Neutral</Badge>
          <Badge tone="primary">Primary</Badge>
          <Badge tone="success">Success</Badge>
          <Badge tone="warning">Warning</Badge>
          <Badge tone="danger">Danger</Badge>
        </div>
      ),
    },
  ],
} satisfies ComponentDemo;
