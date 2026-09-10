import { plugin } from "../../../base/plugin-registry";
import { lookupDefinitions } from "./lookup";

export default plugin({
  name: "lookups",
  description: "Lookup value resolution",
  registerExtensionPoints(context) {
    context.registerExtensionPoint({ point: lookupDefinitions });
  },
});
