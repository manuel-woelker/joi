import { plugin } from "../plugins/registry";
import { lookupDefinitions } from "./lookup";

export default plugin({
  name: "lookups",
  description: "Lookup value resolution",
  registerExtensionPoints(context) {
    context.registerExtensionPoint({ point: lookupDefinitions });
  },
});
