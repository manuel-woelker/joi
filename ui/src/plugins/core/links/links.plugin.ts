import { plugin } from "../../../base/plugin-registry";
import { linkTargetProviders } from "./link-targets";

export default plugin({
  name: "links",
  description: "Internal rich-text link providers",
  registerExtensionPoints(context) {
    context.registerExtensionPoint({ point: linkTargetProviders });
  },
});
