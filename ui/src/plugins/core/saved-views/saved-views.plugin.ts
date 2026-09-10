import { plugin } from "../../../base/plugin-registry";
import { savedViewDefaults } from "./contribution";

export default plugin({
  name: "saved-views",
  description: "Domain-neutral saved query and presentation infrastructure",
  registerExtensionPoints(context) {
    context.registerExtensionPoint({ point: savedViewDefaults });
  },
});
