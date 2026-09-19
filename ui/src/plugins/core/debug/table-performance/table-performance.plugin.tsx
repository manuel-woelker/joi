import { plugin } from "../../../../base/plugin-registry";
import { debugContributions } from "../core/contribution";
import { TablePerformanceDebugContribution } from "./TablePerformanceDebugContribution";

export default plugin({
  name: "table-performance-debug",
  description: "Entity table performance metrics",
  registerExtensions(context) {
    context.registerExtension({
      point: debugContributions,
      id: "table-performance",
      description: "Shows fetch, process, and display timings for entity tables",
      value: {
        id: "table-performance",
        name: "Table performance",
        group: "frontend",
        content: () => <TablePerformanceDebugContribution />,
      },
    });
  },
});
