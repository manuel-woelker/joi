// @vitest-environment happy-dom

import { createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import { createNavigationController } from "./navigation";

describe("NavigationController", () => {
  it("decodes record routes and preserves their owner when closing", () => {
    window.location.hash = "#/views/planning/records/item%2F1";
    createRoot((dispose) => {
      const navigation = createNavigationController();
      expect(navigation.selection()).toEqual({
        type: "record",
        owner: { type: "view", id: "planning" },
        recordId: "item/1",
      });

      navigation.closeRecord();
      expect(navigation.selection()).toEqual({ type: "view", id: "planning" });
      dispose();
    });
  });

  it("keeps unknown hashes distinct from an empty route", () => {
    window.location.hash = "#unsupported";
    createRoot((dispose) => {
      expect(createNavigationController().selection()).toEqual({ type: "unknown", hash: "#unsupported" });
      dispose();
    });
  });

  it("encodes record IDs and replaces create routes after creation", () => {
    window.location.hash = "#/views/planning/new";
    const replaceState = vi.spyOn(window.history, "replaceState");
    createRoot((dispose) => {
      const navigation = createNavigationController();
      navigation.finishCreatingRecord("item/1");
      expect(replaceState).toHaveBeenCalledWith(undefined, "", "#/views/planning/records/item%2F1");
      dispose();
    });
  });

  it("removes its hash listener on cleanup", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    createRoot((dispose) => {
      createNavigationController();
      dispose();
    });
    expect(remove).toHaveBeenCalledWith("hashchange", expect.any(Function));
  });
});
