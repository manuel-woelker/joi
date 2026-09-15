import { plugin } from "../../../base/plugin-registry";
import { fetchServiceKey } from "../../../base/services/fetch-service";
import { debugContributions } from "../../core/debug/core/contribution";
import { TicketTestDataDebugContribution } from "./TicketTestDataDebugContribution";

export default plugin({
  name: "ticket-test-data-debug",
  description: "Ticket test-data generation controls",
  requires: { fetchService: fetchServiceKey },
  registerExtensions(context) {
    context.registerExtension({
      point: debugContributions,
      id: "ticket-test-data",
      description: "Generates additional fake ticket records",
      value: {
        id: "ticket-test-data",
        name: "Test data",
        group: "backend",
        content: () => <TicketTestDataDebugContribution fetchService={context.services.fetchService} />,
      },
    });
  },
});
