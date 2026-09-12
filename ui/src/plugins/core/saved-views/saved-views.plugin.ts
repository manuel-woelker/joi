import { plugin } from "../../../base/plugin-registry";
import { savedViewDefaults } from "./contribution";
import { applicationProviders, shellContributionId } from "../shell/contribution";
import { WorkspaceProvider } from "./controller";

export default plugin({
  name: "saved-views",
  description: "Domain-neutral saved query and presentation infrastructure",
  registerExtensionPoints(context) {
    context.registerExtensionPoint({ point: savedViewDefaults });
  },
  registerExtensions(context) {
    context.registerExtension({
      point: applicationProviders,
      id: "workspace-provider",
      description: "Provides saved workspace state",
      value: { id: shellContributionId("workspace-provider"), order: 0, component: WorkspaceProvider },
    });
  },
});
