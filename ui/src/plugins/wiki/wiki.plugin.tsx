import { plugin } from "../../base/plugin-registry";
import { fetchServiceKey } from "../../base/services/fetch-service";
import { linkTargetProviders } from "../core/links/link-targets";
import { wikiLinkProvider } from "./wiki-link-provider";
import { modelServiceKey } from "../core/entities/model-service";
import { entityDisplays } from "../core/entity-pages/contribution";
import { EntityMasterDetailView } from "../core/master-detail/EntityMasterDetailView";
import { navigationEntryId, navigationSection, navigationSectionId } from "../core/navigation/contribution";
import { shellContributionId, viewResolvers } from "../core/shell/contribution";
import { WikiPage } from "./WikiPage";
import { wikiPageEntityId } from "./wikipage-entity";

const viewId = "wiki-pages";

export default plugin({
  name: "wiki",
  description: "Wiki page browsing and rich-text editing",
  requires: { models: modelServiceKey, fetchService: fetchServiceKey },
  registerExtensions(context) {
    context.registerExtension({
      point: linkTargetProviders,
      id: "wiki-links",
      description: "Wiki page links",
      value: wikiLinkProvider(context.services.fetchService),
    });
    context.registerExtension({
      point: entityDisplays,
      id: "wiki-page-display",
      description: "Read and edit wiki pages",
      value: { entityType: wikiPageEntityId, component: WikiPage },
    });
    const icon = context.services.models.icon(wikiPageEntityId);
    context.registerExtension({
      point: navigationSection,
      id: "wiki-navigation",
      description: "Adds the Wiki navigation section",
      value: {
        id: navigationSectionId("wiki"),
        label: "Wiki",
        order: 20,
        roots: () => [
          {
            id: navigationEntryId("wiki-start"),
            type: "leaf" as const,
            label: "Start",
            icon,
            selection: { type: "entity" as const, reference: ":wiki:Start" },
          },
          {
            id: navigationEntryId(viewId),
            type: "leaf" as const,
            label: "Wiki pages",
            icon,
            selection: { type: "view" as const, id: `system:wiki:${viewId}` },
            copyToWorkspace: () => ({
              type: "shortcut" as const,
              shortcut: {
                name: "Wiki pages",
                selection: { type: "view" as const, id: viewId },
                sourceNavigationEntryId: `wiki/${viewId}`,
              },
            }),
          },
        ],
      },
    });
    context.registerExtension({
      point: viewResolvers,
      id: "wiki-views",
      description: "Resolves wiki list, creation and record routes",
      value: {
        id: shellContributionId("wiki-views"),
        order: 20,
        resolve(selection) {
          const owner = selection.type === "record" || selection.type === "create" ? selection.owner : selection;
          if (owner.type !== "view") return undefined;
          const route = owner.route;
          const id = route?.section === "wiki" && route.source !== "workspace" ? route.id : owner.id;
          return id === viewId || id === `system:wiki:${viewId}`
            ? {
                id: viewId,
                name: "Wiki pages",
                section: "Wiki",
                icon,
                content: () => <EntityMasterDetailView entityId={wikiPageEntityId} openRecordOnSelect />,
              }
            : undefined;
        },
      },
    });
  },
});
