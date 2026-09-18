import { describe, expect, it } from "vitest";

import { entityId } from "../entities/entity-description";
import type { WorkspaceDocument } from "../saved-views/model";
import { navigationEntryId } from "./contribution";
import { addRecent, referenceForSelection, type RecentViewReference } from "./recent-views";

const workspace: WorkspaceDocument = {
  version: 5,
  queries: { q: { id: "q", name: "Q", entityId: entityId("tickets"), sorting: [] } },
  presentations: {
    p: { id: "p", name: "P", entityId: entityId("tickets"), layout: "table", density: "compact", fields: [] },
  },
  views: { mine: { id: "mine", name: "Mine", queryId: "q", presentationId: "p" } },
  navigation: { nav: { id: "nav", type: "view", viewId: "mine" } },
  rootItems: ["nav"],
};

describe("recent views", () => {
  it("prefers matching system leaves and normalizes record routes", () => {
    const leaf = {
      id: navigationEntryId("tickets"),
      type: "leaf" as const,
      label: "Tickets",
      selection: { type: "view" as const, id: "mine" },
    };
    expect(
      referenceForSelection(
        {
          type: "record",
          owner: { type: "view", id: "mine", route: { source: "system", section: "tickets", id: leaf.id } },
          recordId: "1",
        },
        [leaf],
        workspace,
      ),
    ).toEqual({ type: "system", section: "tickets", entryId: leaf.id });
  });

  it("deduplicates, puts the latest first, and keeps eight entries", () => {
    let recent: RecentViewReference[] = Array.from({ length: 8 }, (_, index) => ({
      type: "workspace" as const,
      viewId: `view-${index}`,
    }));
    recent = addRecent(recent, { type: "workspace", viewId: "view-4" });
    expect(recent).toHaveLength(8);
    expect(recent[0]).toEqual({ type: "workspace", viewId: "view-4" });
    expect(recent.filter((entry) => entry.type === "workspace" && entry.viewId === "view-4")).toHaveLength(1);
  });

  it("resolves workspace shortcuts back to their system view", () => {
    const shortcutWorkspace = structuredClone(workspace);
    shortcutWorkspace.navigation.projects = {
      id: "projects",
      type: "shortcut",
      name: "Projects",
      selection: { type: "view", id: "projects" },
      sourceNavigationEntryId: "administration/projects",
    };
    const systemLeaf = {
      id: navigationEntryId("projects"),
      type: "leaf" as const,
      label: "Projects",
      selection: { type: "view" as const, id: "system:administration:projects" },
    };

    expect(
      referenceForSelection(
        {
          type: "view",
          id: "projects",
          route: { source: "workspace", section: "workspace", id: "projects" },
        },
        [systemLeaf],
        shortcutWorkspace,
      ),
    ).toEqual({ type: "system", section: "administration", entryId: navigationEntryId("projects") });
  });
});
