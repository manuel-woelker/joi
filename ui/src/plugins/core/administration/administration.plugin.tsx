import { plugin } from "../../../base/plugin-registry";
import { useNavigation } from "../../../base/navigation";
import { pluginRegistryServiceKey } from "../../../base/plugin-registry-service";
import { navigationSections, shellContributionId, viewResolvers } from "../shell/contribution";
import { Administration, administrationEntries } from "./Administration";
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
      point: navigationSections,
      id: "administration-navigation",
      description: "Displays administration navigation entries",
      value: {
        id: shellContributionId("administration-navigation"),
        order: 100,
        component: () => {
          const navigation = useNavigation();
          return (
            <Administration
              registry={registry}
              selectedId={navigation.selectedAdministrationId()}
              onSelect={(contribution) => navigation.selectAdministration(contribution.id)}
            />
          );
        },
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
            selection.type === "administration"
              ? selection.id
              : (selection.type === "record" || selection.type === "create") &&
                  selection.owner.type === "administration"
                ? selection.owner.id
                : undefined;
          return id ? administrationEntries(registry).find((entry) => entry.id === id) : undefined;
        },
      },
    });
  },
});
