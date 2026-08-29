import { plugin } from "../plugins/registry";
import { administrationContributions } from "./contribution";

export default plugin({
  name: "administration",
  description: "Administration views",
  registerExtensionPoints(context) {
    context.registerExtensionPoint({ point: administrationContributions });
  },
});
