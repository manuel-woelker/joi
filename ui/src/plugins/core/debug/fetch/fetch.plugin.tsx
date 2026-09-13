import { plugin } from "../../../../base/plugin-registry";
import { fetchServiceKey } from "../../../../base/services/fetch-service";
import { debugContributions } from "../core/contribution";
import { FetchDebugContribution } from "./FetchDebugContribution";

export default plugin({
  name: "fetch-debug",
  description: "Fetch request debugging controls",
  requires: { fetchService: fetchServiceKey },
  registerExtensions(context) {
    context.registerExtension({
      point: debugContributions,
      id: "fetch",
      description: "Configures an artificial delay for fetch requests",
      value: {
        id: "fetch",
        name: "Fetch",
        group: "frontend",
        content: () => <FetchDebugContribution fetchService={context.services.fetchService} />,
      },
    });
  },
});
