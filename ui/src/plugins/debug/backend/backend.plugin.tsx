import { ExtensionPointsDebugContribution, PluginsDebugContribution } from "./PluginMetadataDebugContributions";
import { plugin } from "../../registry";
import { fetchServiceKey } from "../../../services/fetch-service";
import { debugContributions } from "../core/contribution";
import { BackendPluginsService, backendPluginsServiceKey } from "./plugins-api";

export default plugin({
  name: "backend",
  description: "Backend diagnostics",
  requires: { fetchService: fetchServiceKey },
  provides: { backendPluginsService: backendPluginsServiceKey },
  initialize({ fetchService }) {
    return { backendPluginsService: new BackendPluginsService({ fetchService }) };
  },
  registerExtensions(context) {
    context.registerExtension({
      point: debugContributions,
      id: "plugins",
      description: "Displays plugins and their extension points",
      value: {
        id: "plugins",
        name: "Plugins",
        group: "backend",
        content: () => <PluginsDebugContribution backendPluginsService={context.services.backendPluginsService} />,
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
        content: () => (
          <ExtensionPointsDebugContribution backendPluginsService={context.services.backendPluginsService} />
        ),
      },
    });
  },
});
