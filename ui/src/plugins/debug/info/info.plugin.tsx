import { plugin } from "../../registry";
import { debugContributions } from "../core/contribution";
import { InfoDebugContribution } from "./InfoDebugContribution";

export default plugin({
  name: "info",
  description: "Application information tools",
  registerExtensions(context) {
    context.registerExtension({
      point: debugContributions,
      id: "info",
      description: "Displays application and runtime information",
      value: { id: "info", name: "Info", group: "info", content: InfoDebugContribution },
    });
  },
});
