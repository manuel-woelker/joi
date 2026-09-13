import { plugin } from "../../base/plugin-registry";
import { entityDescriptions } from "../core/entities/entity-registry";
import { EntityMasterDetailView } from "../core/master-detail/EntityMasterDetailView";
import { navigationEntryId, navigationSection, navigationSectionId } from "../core/navigation/contribution";
import { shellContributionId, viewResolvers } from "../core/shell/contribution";
import { repositoryEntity } from "./repository-entity";

const repositoriesViewId = "codevette-repositories";

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
      point: navigationSection,
      id: "codevette-navigation",
      description: "Displays Codevette navigation entries",
      value: {
        id: navigationSectionId("codevette"),
        label: "Codevette",
        order: 10,
        roots: () => [
          {
            id: navigationEntryId("repositories"),
            type: "leaf" as const,
            label: "Repositories",
            description: "Repositories configured for trunk-based code review.",
            icon: repositoryEntity.icon,
            selection: { type: "view" as const, id: repositoriesViewId },
            copyToWorkspace: () => ({
              type: "shortcut" as const,
              shortcut: {
                name: "Repositories",
                description: "Repositories configured for trunk-based code review.",
                selection: { type: "view" as const, id: repositoriesViewId },
                sourceNavigationEntryId: "codevette/repositories",
              },
            }),
          },
        ],
      },
    });
    context.registerExtension({
      point: viewResolvers,
      id: "codevette-views",
      description: "Resolves Codevette views",
      value: {
        id: shellContributionId("codevette-views"),
        order: 10,
        resolve(selection) {
          const id =
            selection.type === "view"
              ? selection.id
              : selection.type === "record" || selection.type === "create"
                ? selection.owner.id
                : undefined;
          return id === repositoriesViewId
            ? {
                id: repositoriesViewId,
                name: "Repositories",
                description: "Repositories configured for trunk-based code review.",
                section: "Codevette",
                icon: repositoryEntity.icon,
                content: () => <EntityMasterDetailView entityId={repositoryEntity.id} />,
              }
            : undefined;
        },
      },
    });
  },
});
