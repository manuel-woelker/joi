import { actionId, type EntityRecordActionTarget } from "../../../actions/action";
import { actionContributions } from "../../../actions/contribution";
import { plugin } from "../../registry";

export const assignToMeActionId = actionId("tickets.assign-to-me");

export default plugin({
  name: "Ticket actions",
  description: "Contributes actions for selected tickets.",
  registerExtensions(context) {
    context.registerExtension({
      point: actionContributions,
      id: assignToMeActionId,
      description: "Assigns the selected ticket to the current user.",
      value: {
        id: assignToMeActionId,
        label: "Assign to me",
        description: "Assign the selected ticket to the current user.",
        hotkey: "i",
        compatibleEntityTypes: ["tickets"],
        isAvailable: ({ target }) => target?.type === "entity-record",
        execute: async ({ currentUser, target }) => {
          await (target as EntityRecordActionTarget).update({ assignee: currentUser.id });
        },
      },
    });
  },
});
