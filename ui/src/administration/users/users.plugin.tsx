import { plugin } from "../../plugins/registry";
import { fetchServiceKey } from "../../services/fetch-service";
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
        content: () => <Users fetchService={context.services.fetchService} />,
      },
    });
  },
});
