import { describe, expect, it, vi } from "vitest";

import { actionId, type UiAction } from "./action";
import { actionsToContextMenuEntries } from "./action-context-menu";

describe("actionsToContextMenuEntries", () => {
  it("preserves action presentation and delegates execution", async () => {
    const action: UiAction = {
      id: actionId("tickets.assign"),
      label: "Assign to me",
      description: "Assign the ticket.",
      hotkey: "i",
      isAvailable: () => true,
      execute: () => undefined,
    };
    const execute = vi.fn();
    const [entry] = actionsToContextMenuEntries([action], { disabled: true, execute });

    expect(entry).toMatchObject({
      id: "tickets.assign",
      label: "Assign to me",
      description: "Assign the ticket.",
      keyboardHint: "i",
      disabled: true,
    });
    await entry.execute();
    expect(execute).toHaveBeenCalledWith(action);
  });
});
