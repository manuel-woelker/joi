import { userEntity } from "./user-entity";
import { plugin } from "../../../../base/plugin-registry";
import { fetchServiceKey } from "../../../../base/services/fetch-service";
import { administrationContributions } from "../contribution";
import { Users } from "./Users";

export default plugin({
  name: "users-administration",
  description: "User administration",
  requires: { fetchService: fetchServiceKey },
  registerExtensions(context) {
    context.registerExtension({
      point: administrationContributions,
      id: "users",
      description: "Displays registered users",
      value: {
        id: "users",
        name: "Users",
        section: "Administration",
        icon: userEntity.icon,
        content: () => <Users fetchService={context.services.fetchService} />,
      },
    });
  },
});
