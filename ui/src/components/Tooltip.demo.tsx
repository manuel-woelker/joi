import type { ComponentDemo } from "../plugins/core/playground/demo";
import { Tooltip } from "./Tooltip";

export default {
  name: "Tooltip",
  description: "Delayed information on hover or keyboard focus.",
  scenarios: [
    {
      name: "Text",
      description: "The content is created only after the hover delay.",
      render: () => (
        <Tooltip content={() => "Tickets awaiting review"}>
          <button type="button">Review requested</button>
        </Tooltip>
      ),
    },
    {
      name: "Rich content",
      description: "The popup can contain structured information.",
      render: () => (
        <Tooltip
          delay={250}
          content={() => (
            <div>
              <strong>Assigned to Jane Developer</strong>
              <div>Member of the development team</div>
            </div>
          )}
        >
          <button type="button">Jane Developer</button>
        </Tooltip>
      ),
    },
    {
      name: "Clipped container",
      description: "The popup remains visible outside an overflow-hidden parent.",
      render: () => (
        <div style={{ width: "160px", overflow: "hidden", border: "1px solid var(--color-border)" }}>
          <Tooltip content={() => "This tooltip is rendered outside the clipped container."}>
            <button type="button">Hover here</button>
          </Tooltip>
        </div>
      ),
    },
  ],
} satisfies ComponentDemo;
