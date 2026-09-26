import { plugin } from "../../../base/plugin-registry";
import { fetchServiceKey } from "../../../base/services/fetch-service";
import { applicationProviders, shellContributionId } from "../shell/contribution";
import { EntityHistoryService, entityHistoryServiceKey } from "./entity-history-service";
import { EntityHistoryProvider } from "./entity-history-context";

export default plugin({
  name: "entity-history",
  description: "Transactional entity history in record details",
  requires: { fetchService: fetchServiceKey },
  provides: { history: entityHistoryServiceKey },
  initialize({ fetchService }) {
    return { history: new EntityHistoryService(fetchService) };
  },
  registerExtensions(context) {
    context.registerExtension({
      point: applicationProviders,
      id: "entity-history",
      description: "Provides entity history to record detail views",
      value: {
        id: shellContributionId("entity-history"),
        order: 30,
        component: (props) => (
          <EntityHistoryProvider service={context.services.history}>{props.children}</EntityHistoryProvider>
        ),
      },
    });
  },
});
