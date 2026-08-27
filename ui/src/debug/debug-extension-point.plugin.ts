import { plugin } from "../plugins/registry";
import { debugContributions } from "./contribution";

export default plugin("core", "Core UI extension points", (context) => {
  context.registerExtensionPoint(debugContributions);
}, -100);
