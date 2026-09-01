import { actionId } from "../actions/action";
import { actionContributions } from "../actions/contribution";
import { plugin } from "../plugins/registry";

export const openPlaygroundActionId = actionId("playground.open");

export default plugin({
  name: "Playground actions",
  description: "Contributes actions for opening the component playground.",
  registerExtensions(context) {
    if (!import.meta.env.DEV) return;
    context.registerExtension({
      point: actionContributions,
      id: openPlaygroundActionId,
      description: "Opens the component playground.",
      value: {
        id: openPlaygroundActionId,
        label: "Open playground",
        description: "Open the component playground.",
        isAvailable: () => true,
        execute: () => {
          window.location.hash = "#playground";
        },
      },
    });
  },
});
