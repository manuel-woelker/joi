import { plugin } from "../../../base/plugin-registry";
import { pluginRegistryServiceKey } from "../../../base/plugin-registry-service";
import { shellContributionId, viewResolvers } from "../shell/contribution";
import { entityDisplays } from "./contribution";
import { EntityPage } from "./EntityPage";

export default plugin({
  name: "entity-pages",
  description: "Standalone entity pages with overridable displays",
  requires: { registry: pluginRegistryServiceKey },
  registerExtensionPoints(context) {
    context.registerExtensionPoint({ point: entityDisplays });
  },
  registerExtensions(context) {
    context.registerExtension({
      point: viewResolvers,
      id: "entity-pages",
      description: "Resolves entity query-parameter links",
      value: {
        id: shellContributionId("entity-pages"),
        order: -100,
        resolve(selection) {
          return selection.type === "entity"
            ? {
                id: `entity:${selection.reference}`,
                name: "Entity",
                section: "Record",
                hideHeading: true,
                content: () => (
                  <EntityPage
                    reference={selection.reference}
                    displays={context.services.registry.extensions(entityDisplays)}
                  />
                ),
              }
            : undefined;
        },
      },
    });
  },
});
