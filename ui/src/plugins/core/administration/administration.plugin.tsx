import { plugin } from "../../../base/plugin-registry";
import { pluginRegistryServiceKey } from "../../../base/plugin-registry-service";
import { shellContributionId, viewResolvers } from "../shell/contribution";
import { navigationEntryId, navigationSection, navigationSectionId } from "../navigation/contribution";
import { administrationEntries } from "./Administration";
import { administrationContributions } from "./contribution";

export default plugin({
  name: "administration",
  description: "Administration views",
  requires: { pluginRegistry: pluginRegistryServiceKey },
  registerExtensionPoints(context) {
    context.registerExtensionPoint({ point: administrationContributions });
  },
  registerExtensions(context) {
    const registry = context.services.pluginRegistry;
    context.registerExtension({
      point: navigationSection,
      id: "administration-navigation",
      description: "Displays administration navigation entries",
      value: {
        id: navigationSectionId("administration"),
        label: "Administration",
        order: 100,
        roots: () =>
          administrationEntries(registry).map((entry) => ({
            id: navigationEntryId(entry.id),
            type: "leaf" as const,
            label: entry.name,
            description: entry.description,
            icon: entry.icon,
            selection: { type: "view" as const, id: entry.id },
            copyToWorkspace: () => ({
              type: "shortcut" as const,
              shortcut: {
                name: entry.name,
                description: entry.description,
                selection: { type: "view" as const, id: entry.id },
                sourceNavigationEntryId: `administration/${entry.id}`,
              },
            }),
          })),
      },
    });
    context.registerExtension({
      point: viewResolvers,
      id: "administration-views",
      description: "Resolves administration routes",
      value: {
        id: shellContributionId("administration-views"),
        order: 100,
        resolve(selection) {
          const id =
            selection.type === "view"
              ? selection.id
              : selection.type === "record" || selection.type === "create"
                ? selection.owner.id
                : undefined;
          return id ? administrationEntries(registry).find((entry) => entry.id === id) : undefined;
        },
      },
    });
  },
});
