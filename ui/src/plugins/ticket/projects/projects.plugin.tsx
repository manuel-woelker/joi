import { plugin } from "../../../base/plugin-registry";
import { administrationContributions } from "../../core/administration/contribution";
import { modelServiceKey } from "../../core/entities/model-service";
import { EntityMasterDetailView } from "../../core/master-detail/EntityMasterDetailView";
import { projectEntityId } from "./project-entity";

export default plugin({
  name: "ticket-projects",
  description: "Ticket project administration and lookup",
  requires: { models: modelServiceKey },
  registerExtensions(context) {
    context.registerExtension({
      point: administrationContributions,
      id: "projects",
      description: "Creates and edits ticket projects",
      value: {
        id: "projects",
        name: "Projects",
        section: "Administration",
        icon: context.services.models.icon(projectEntityId),
        content: () => <EntityMasterDetailView entityId={projectEntityId} />,
      },
    });
  },
});
