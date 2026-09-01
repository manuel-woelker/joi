import { plugin } from "../plugins/registry";
import { actionContributions } from "./contribution";

export default plugin({
  name: "UI actions",
  description: "Registers contextual user actions.",
  registerExtensionPoints(context) {
    context.registerExtensionPoint({ point: actionContributions });
  },
});
