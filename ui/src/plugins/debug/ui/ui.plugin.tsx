import { UiExtensionPointsDebugContribution, UiPluginsDebugContribution } from "./UiPluginMetadataDebugContributions";
import { plugin } from "../../registry";
import { pluginRegistryServiceKey } from "../../plugin-registry-service";
import { debugContributions } from "../core/contribution";

export default plugin({
  name: "ui",
  description: "UI diagnostics",
  requires: { pluginRegistryService: pluginRegistryServiceKey },
  registerExtensions(context) {
    context.registerExtension({
      point: debugContributions,
      id: "ui-plugins",
      description: "Displays UI plugins and their contributions",
      value: {
        id: "ui-plugins",
        name: "UI Plugins",
        group: "frontend",
        content: () => <UiPluginsDebugContribution pluginRegistry={context.services.pluginRegistryService} />,
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
        content: () => <UiExtensionPointsDebugContribution pluginRegistry={context.services.pluginRegistryService} />,
      },
    });
  },
});
