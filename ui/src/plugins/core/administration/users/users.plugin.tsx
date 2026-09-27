import { userEntityId } from "./user-entity";
import { modelServiceKey } from "../../entities/model-service";
import { plugin } from "../../../../base/plugin-registry";
import { administrationContributions } from "../contribution";
import { EntityMasterDetailView } from "../../master-detail/EntityMasterDetailView";

export default plugin({
  name: "users-administration",
  description: "User administration",
  requires: { models: modelServiceKey },
  registerExtensions(context) {
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
