import { plugin } from "../../../base/plugin-registry";
import { applicationProviders, shellOverlays, topBarContributions, viewResolvers } from "./contribution";

export default plugin({
  name: "application-shell",
  description: "Core application shell extension points",
  registerExtensionPoints(context) {
    context.registerExtensionPoint({ point: applicationProviders });
    context.registerExtensionPoint({ point: viewResolvers });
    context.registerExtensionPoint({ point: shellOverlays });
    context.registerExtensionPoint({ point: topBarContributions });
  },
});
