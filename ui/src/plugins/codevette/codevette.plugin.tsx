import { plugin } from "../../base/plugin-registry";
import { administrationContributions } from "../core/administration/contribution";
import { entityDescriptions } from "../core/entities/entity-registry";
import { EntityMasterDetailView } from "../core/master-detail/EntityMasterDetailView";
import { repositoryEntity } from "./repository-entity";

export default plugin({
  name: "codevette",
  description: "Trunk-based code review tools",
  registerExtensions(context) {
    context.registerExtension({
      point: entityDescriptions,
      id: "repository-entity",
      description: "Defines repositories available for code review",
      value: repositoryEntity,
    });
    context.registerExtension({
      point: administrationContributions,
      id: "repositories",
      description: "Configures repositories available for code review",
      value: {
        id: "repositories",
        name: "Repositories",
        description: "Repositories configured for trunk-based code review.",
        section: "Administration",
        icon: repositoryEntity.icon,
        content: () => <EntityMasterDetailView entityId={repositoryEntity.id} />,
      },
    });
  },
});
