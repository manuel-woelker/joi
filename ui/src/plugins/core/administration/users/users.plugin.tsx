import { userEntityId } from "./user-entity";
import { modelServiceKey } from "../../entities/model-service";
import { plugin } from "../../../../base/plugin-registry";
import { fetchServiceKey } from "../../../../base/services/fetch-service";
import { linkTargetProviders } from "../../links/link-targets";
import { queryLinkProvider } from "../../links/query-link-provider";
import { administrationContributions } from "../contribution";
import { EntityMasterDetailView } from "../../master-detail/EntityMasterDetailView";

export default plugin({
  name: "users-administration",
  description: "User administration",
  requires: { models: modelServiceKey, fetchService: fetchServiceKey },
  registerExtensions(context) {
    context.registerExtension({
      point: linkTargetProviders,
      id: "user-links",
      description: "User links",
      value: queryLinkProvider({
        service: context.services.fetchService,
        type: "user",
        label: "User",
        table: "users",
        key: "username",
        title: "name",
        href: (_key, row) => `#/entity?entity=${encodeURIComponent(`users:${row.id}`)}`,
      }),
    });
    context.registerExtension({
      point: administrationContributions,
      id: "users",
      description: "Displays registered users",
      value: {
        id: "users",
        name: "Users",
        section: "Administration",
        icon: context.services.models.icon(userEntityId),
        content: () => <EntityMasterDetailView entityId={userEntityId} />,
      },
    });
  },
});
