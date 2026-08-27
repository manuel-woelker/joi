import { InfoDebugContribution } from "../debug/InfoDebugContribution";
import {
  ExtensionPointsDebugContribution,
  PluginsDebugContribution,
} from "../debug/PluginMetadataDebugContributions";
import { debugContributions } from "../debug/contribution";
import {
  UiExtensionPointsDebugContribution,
  UiPluginsDebugContribution,
} from "../debug/UiPluginMetadataDebugContributions";
import { PluginRegistryBuilder, plugin } from "./registry";

export function createApplicationPluginRegistry() {
  return new PluginRegistryBuilder()
    .register(plugin("core", "Core UI extension points", (context) => {
      context.registerExtensionPoint(debugContributions);
    }))
    .register(plugin("application-info", "Application information tools", (context) => {
      context.registerExtension(
        debugContributions,
        "info",
        "Displays application and runtime information",
        { id: "info", name: "Info", content: InfoDebugContribution },
      );
      context.registerExtension(
        debugContributions,
        "plugins",
        "Displays plugins and their extension points",
        {
          id: "plugins",
          name: "Plugins",
          content: PluginsDebugContribution,
        },
      );
      context.registerExtension(
        debugContributions,
        "ui-plugins",
        "Displays UI plugins and their contributions",
        { id: "ui-plugins", name: "UI Plugins", content: UiPluginsDebugContribution },
      );
      context.registerExtension(
        debugContributions,
        "ui-extension-points",
        "Displays UI extension points and their extensions",
        {
          id: "ui-extension-points",
          name: "UI Extension Points",
          content: UiExtensionPointsDebugContribution,
        },
      );
      context.registerExtension(
        debugContributions,
        "extension-points",
        "Displays extension points and their extensions",
        {
          id: "extension-points",
          name: "Extension Points",
          content: ExtensionPointsDebugContribution,
        },
      );
    }))
    .build();
}
