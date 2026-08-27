import { InfoDebugContribution } from "../debug/InfoDebugContribution";
import { debugContributions } from "../debug/contribution";
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
    }))
    .build();
}
