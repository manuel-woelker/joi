import { plugin } from "../../../../base/plugin-registry";
import { fetchServiceKey } from "../../../../base/services/fetch-service";
import { debugContributions } from "../core/contribution";
import { InfoDebugContribution } from "./InfoDebugContribution";
import { BackendInfoService, backendInfoServiceKey } from "./info-api";

export default plugin({
  name: "info",
  description: "Application information tools",
  requires: { fetchService: fetchServiceKey },
  provides: { backendInfoService: backendInfoServiceKey },
  initialize({ fetchService }) {
    return { backendInfoService: new BackendInfoService({ fetchService }) };
  },
  registerExtensions(context) {
    context.registerExtension({
      point: debugContributions,
      id: "info",
      description: "Displays application and runtime information",
      value: {
        id: "info",
        name: "Info",
        group: "info",
        content: () => <InfoDebugContribution backendInfoService={context.services.backendInfoService} />,
      },
    });
  },
});
