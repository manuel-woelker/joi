import { describe, expect, it } from "vitest";

import { actionId, isActionAvailable, normalizeHotkey, validateActions, type UiAction } from "./action";

const action = (overrides: Partial<UiAction> = {}): UiAction => ({
  id: actionId("test.action"),
  label: "Test",
  description: "Tests an action.",
  isAvailable: () => true,
  execute: () => undefined,
  ...overrides,
});

describe("UI actions", () => {
  it("normalizes hotkeys and validates duplicate metadata", () => {
    expect(normalizeHotkey("I")).toBe("i");
    expect(() => normalizeHotkey("ii")).toThrow("one character");
    expect(() => validateActions([action({ hotkey: "I" }), action({ id: actionId("other"), hotkey: "i" })])).toThrow(
      "registered more than once",
    );
  });

  it("applies compatible entity types before dynamic availability", () => {
    const candidate = action({ compatibleEntityTypes: ["tickets"] });
    const currentUser = { id: "user-1", username: "jane", name: "Jane" };
    expect(isActionAvailable(candidate, { currentUser })).toBe(false);
    expect(
      isActionAvailable(candidate, {
        currentUser,
        target: {
          type: "entity-record",
          entityId: "users",
          recordId: "user-1",
          values: {},
          update: async () => undefined,
        },
      }),
    ).toBe(false);
  });

  it("rejects invalid compatible entity lists", () => {
    expect(() => validateActions([action({ compatibleEntityTypes: [] })])).toThrow("empty compatible");
    expect(() => validateActions([action({ compatibleEntityTypes: ["tickets", "tickets"] })])).toThrow("repeats");
  });
});
