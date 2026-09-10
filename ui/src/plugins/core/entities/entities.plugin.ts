import { plugin } from "../../../base/plugin-registry";
import { entityDescriptions } from "./entity-registry";

export default plugin({
  name: "entities",
  description: "Entity description registry",
  registerExtensionPoints(context) {
    context.registerExtensionPoint({ point: entityDescriptions });
  },
});
