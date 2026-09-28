// @vitest-environment happy-dom

import { createRoot } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createNavigationController } from "./navigation";

afterEach(() => window.history.replaceState(undefined, "", "/"));

describe("NavigationController", () => {
  it("opens a dedicated entity hash route and restores the originating view on close", () => {
    window.history.replaceState(undefined, "", "/?debug=1#/tickets/view-all");
    createRoot((dispose) => {
      const navigation = createNavigationController();
      navigation.selectEntity("wikipage:page/with:colon & spaces");
      expect(window.location.search).toBe("?debug=1");
      expect(window.location.hash.startsWith("#/entity?entity=")).toBe(true);
      expect(navigation.hashState("entity")).toBe("wikipage:page/with:colon & spaces");
      expect(navigation.selection()).toEqual({ type: "entity", reference: "wikipage:page/with:colon & spaces" });
      expect(navigation.selectedViewId()).toBeUndefined();
      navigation.setHashState("edit", "");
      expect(window.location.hash).toContain("&edit=");
      expect(navigation.selection()).toEqual({ type: "entity", reference: "wikipage:page/with:colon & spaces" });
      expect(navigation.hashState("entity")).toBe("wikipage:page/with:colon & spaces");
      navigation.closeEntity();
      expect(window.location.href).toContain("?debug=1#/tickets/view-all");
      expect(navigation.selectedViewId()).toBe("view-all");
      dispose();
    });
  });

  it("leaves standalone pages when selecting a view and responds to browser history", () => {
    window.history.replaceState(undefined, "", "/#/entity?entity=ticket%3ATEST-123");
    createRoot((dispose) => {
      const navigation = createNavigationController();
      navigation.selectView("users", { source: "system", section: "administration", id: "users" });
      expect(window.location.hash).toBe("#/administration/users");
      expect(navigation.selectedViewId()).toBe("users");
      window.history.replaceState(undefined, "", "/#/entity?entity=ticket%3ATEST-123");
      window.dispatchEvent(new PopStateEvent("popstate"));
      expect(navigation.selection()).toEqual({ type: "entity", reference: "ticket:TEST-123" });
      dispose();
    });
  });

  it("normalizes previously shared top-level entity links into the hash", () => {
    window.history.replaceState(undefined, "", "/?debug=1&entity=ticket%3ATEST-123#/tickets/view-all");
    createRoot((dispose) => {
      const navigation = createNavigationController();
      expect(window.location.search).toBe("?debug=1");
      expect(window.location.hash).toBe("#/entity?entity=ticket%3ATEST-123");
      expect(navigation.selection()).toEqual({ type: "entity", reference: "ticket:TEST-123" });
      navigation.closeEntity();
      expect(window.location.href).toContain("?debug=1#/tickets/view-all");
      dispose();
    });
  });
  it("decodes record routes and preserves their owner when closing", () => {
    window.location.hash = "#/workspace/planning/records/item%2F1";
    createRoot((dispose) => {
      const navigation = createNavigationController();
      expect(navigation.selection()).toEqual({
        type: "record",
        owner: {
          type: "view",
          id: "planning",
          route: { source: "workspace", section: "workspace", id: "planning" },
        },
        recordId: "item/1",
      });

      navigation.closeRecord();
      expect(navigation.selection()).toEqual({
        type: "view",
        id: "planning",
        route: { source: "workspace", section: "workspace", id: "planning" },
      });
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
    window.location.hash = "#/workspace/planning/new";
    const replaceState = vi.spyOn(window.history, "replaceState");
    createRoot((dispose) => {
      const navigation = createNavigationController();
      navigation.finishCreatingRecord("item/1");
      expect(replaceState).toHaveBeenCalledWith(undefined, "", "#/workspace/planning/records/item%2F1");
      dispose();
    });
  });

  it("preserves the selected route independently from resolved content", () => {
    window.location.hash = "";
    createRoot((dispose) => {
      const navigation = createNavigationController();
      navigation.selectView("planning", { source: "system", section: "tickets", id: "planning" });
      expect(navigation.activeRoute()).toEqual({ source: "system", section: "tickets", id: "planning" });
      expect(window.location.hash).toBe("#/tickets/planning");

      navigation.selectRecord("item-1");
      expect(navigation.activeRoute()).toEqual({ source: "system", section: "tickets", id: "planning" });
      navigation.closeRecord();
      expect(navigation.selection()).toEqual({
        type: "view",
        id: "planning",
        route: { source: "system", section: "tickets", id: "planning" },
      });
      dispose();
    });
  });

  it("treats administration routes as ordinary system views", () => {
    window.location.hash = "#/administration/users";
    createRoot((dispose) => {
      expect(createNavigationController().selection()).toEqual({
        type: "view",
        id: "users",
        route: { source: "system", section: "administration", id: "users" },
      });
      dispose();
    });
  });

  it("restores and updates route-local hash state without changing the selection", () => {
    window.location.hash = "#/codevette/commit%2F123?tab=diff";
    const replaceState = vi.spyOn(window.history, "replaceState");
    createRoot((dispose) => {
      const navigation = createNavigationController();
      expect(navigation.selectedViewId()).toBe("commit/123");
      expect(navigation.hashState("tab")).toBe("diff");

      navigation.setHashState("tab", undefined);
      expect(navigation.hashState("tab")).toBeUndefined();
      expect(replaceState).toHaveBeenLastCalledWith(null, "", "#/codevette/commit%2F123");
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

  it("supports view ids that span multiple segments", () => {
    window.location.hash = "#/codevette/branches/joi/main";
    createRoot((dispose) => {
      const navigation = createNavigationController();
      expect(navigation.selection()).toEqual({
        type: "view",
        id: "branches/joi/main",
        route: { source: "system", section: "codevette", id: "branches/joi/main" },
      });
      expect(navigation.selectedViewId()).toBe("branches/joi/main");
      dispose();
    });
  });

  it("treats encoded and literal nested view ids the same", () => {
    window.location.hash = "#/codevette/branches%2Fjoi%2Fmain";
    createRoot((dispose) => {
      expect(createNavigationController().selection()).toEqual({
        type: "view",
        id: "branches/joi/main",
        route: { source: "system", section: "codevette", id: "branches/joi/main" },
      });
      dispose();
    });
  });

  it("writes nested view ids with literal separators", () => {
    window.location.hash = "";
    createRoot((dispose) => {
      const navigation = createNavigationController();
      navigation.selectView("branches/joi/main", { source: "system", section: "codevette", id: "branches/joi/main" });
      expect(window.location.hash).toBe("#/codevette/branches/joi/main");
      expect(navigation.selection()).toEqual({
        type: "view",
        id: "branches/joi/main",
        route: { source: "system", section: "codevette", id: "branches/joi/main" },
      });
      dispose();
    });
  });

  it("still detects record and create suffixes after nested view ids", () => {
    window.location.hash = "#/workspace/presence/records/a%2Fb";
    createRoot((dispose) => {
      const navigation = createNavigationController();
      expect(navigation.selection()).toEqual({
        type: "record",
        owner: {
          type: "view",
          id: "presence",
          route: { source: "workspace", section: "workspace", id: "presence" },
        },
        recordId: "a/b",
      });
      dispose();
    });

    window.location.hash = "#/workspace/presence/new";
    createRoot((dispose) => {
      const navigation = createNavigationController();
      expect(navigation.selection()).toEqual({
        type: "create",
        owner: {
          type: "view",
          id: "presence",
          route: { source: "workspace", section: "workspace", id: "presence" },
        },
      });
      dispose();
    });
  });
});
