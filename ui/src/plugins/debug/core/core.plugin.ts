import { plugin } from "../../registry";
import { debugContributions } from "./contribution";

export default plugin({
  name: "core",
  description: "Core UI extension points",
  registerExtensionPoints(context) {
    context.registerExtensionPoint({ point: debugContributions });
  },
});
