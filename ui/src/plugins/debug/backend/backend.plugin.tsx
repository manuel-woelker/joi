import {
  ExtensionPointsDebugContribution,
  PluginsDebugContribution,
} from "./PluginMetadataDebugContributions";
import { plugin } from "../../registry";
import { debugContributions } from "../core/contribution";

export default plugin({
  name: "backend",
  description: "Backend diagnostics",
  registerExtensions(context) {
    context.registerExtension({
      point: debugContributions,
      id: "plugins",
      description: "Displays plugins and their extension points",
      value: { id: "plugins", name: "Plugins", group: "backend", content: PluginsDebugContribution },
    });
    context.registerExtension({
      point: debugContributions,
      id: "extension-points",
      description: "Displays extension points and their extensions",
      value: {
        id: "extension-points",
        name: "Extension Points",
        group: "backend",
        content: ExtensionPointsDebugContribution,
      },
    });
  },
});
