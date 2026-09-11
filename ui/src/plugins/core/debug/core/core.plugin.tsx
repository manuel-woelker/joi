import { plugin } from "../../../../base/plugin-registry";
import { applicationProviders, shellContributionId } from "../../shell/contribution";
import { ExtensionInspectorDebugContribution } from "../inspector/ExtensionInspectorDebugContribution";
import {
  ExtensionInspectorOverlay,
  ExtensionInspectorProvider,
  ExtensionInspectorService,
  extensionInspectorServiceKey,
} from "../inspector/extension-inspector";
import { debugContributions } from "./contribution";

export default plugin({
  name: "core",
  description: "Core UI extension points",
  provides: { extensionInspector: extensionInspectorServiceKey },
  initialize: () => ({ extensionInspector: new ExtensionInspectorService() }),
  registerExtensionPoints(context) {
    context.registerExtensionPoint({ point: debugContributions });
  },
  registerExtensions(context) {
    const inspector = context.services.extensionInspector;
    context.registerExtension({
      point: applicationProviders,
      id: "extension-inspector-provider",
      description: "Provides visual extension inspection",
      value: {
        id: shellContributionId("extension-inspector-provider"),
        order: -1000,
        component: (props) => (
          <ExtensionInspectorProvider service={inspector}>
            {props.children}
            <ExtensionInspectorOverlay />
          </ExtensionInspectorProvider>
        ),
      },
    });
    context.registerExtension({
      point: debugContributions,
      id: "extension-inspector",
      description: "Shows visual UI extension and extension-point boundaries",
      value: {
        id: "extension-inspector",
        name: "Extension Inspector",
        group: "frontend",
        content: ExtensionInspectorDebugContribution,
      },
    });
  },
});
