import { plugin } from "../../../base/plugin-registry";
import { navigationSection } from "./contribution";

export default plugin({
  name: "navigation",
  description: "Application navigation accordion and system trees",
  registerExtensionPoints(context) {
    context.registerExtensionPoint({ point: navigationSection });
  },
});
