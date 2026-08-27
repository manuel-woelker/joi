import { plugin } from "../plugins/registry";
import { InfoDebugContribution } from "./InfoDebugContribution";
import {
  ExtensionPointsDebugContribution,
  PluginsDebugContribution,
} from "./PluginMetadataDebugContributions";
import {
  UiExtensionPointsDebugContribution,
  UiPluginsDebugContribution,
} from "./UiPluginMetadataDebugContributions";
import { debugContributions } from "./contribution";

export default plugin({
  name: "application-info",
  description: "Application information tools",
  registerExtensions(context) {
    context.registerExtension({
      point: debugContributions,
      id: "info",
      description: "Displays application and runtime information",
      value: { id: "info", name: "Info", group: "info", content: InfoDebugContribution },
    });
    context.registerExtension({
      point: debugContributions,
      id: "plugins",
      description: "Displays plugins and their extension points",
      value: { id: "plugins", name: "Plugins", group: "backend", content: PluginsDebugContribution },
    });
    context.registerExtension({
      point: debugContributions,
      id: "ui-plugins",
      description: "Displays UI plugins and their contributions",
      value: {
        id: "ui-plugins",
        name: "UI Plugins",
        group: "frontend",
        content: UiPluginsDebugContribution,
      },
    });
    context.registerExtension({
      point: debugContributions,
      id: "ui-extension-points",
      description: "Displays UI extension points and their extensions",
      value: {
        id: "ui-extension-points",
        name: "UI Extension Points",
        group: "frontend",
        content: UiExtensionPointsDebugContribution,
      },
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
