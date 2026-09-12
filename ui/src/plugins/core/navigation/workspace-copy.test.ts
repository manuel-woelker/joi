import { describe, expect, it } from "vitest";
import { createStore } from "solid-js/store";

import { navigationEntryId, navigationSectionId } from "./contribution";
import { copyForLeaf, copyForWorkspaceView, leafForWorkspaceSource } from "./workspace-copy";
import { createTestWorkspace } from "../saved-views/test-fixtures";

describe("workspace navigation copies", () => {
  it("creates a shortcut when a system leaf has no custom copy factory", () => {
    const copy = copyForLeaf(
      {
        id: navigationEntryId("users"),
        type: "leaf",
        label: "Users",
        selection: { type: "view", id: "users" },
      },
      "administration",
    );

    expect(copy).toEqual({
      type: "shortcut",
      shortcut: {
        name: "Users",
        description: undefined,
        selection: { type: "view", id: "users" },
        sourceNavigationEntryId: "administration/users",
      },
    });
  });

  it("copies workspace views with independent query and presentation definitions", () => {
    const [workspace] = createStore(createTestWorkspace());
    const copy = copyForWorkspaceView(workspace, "view-active");

    expect(copy).toMatchObject({ type: "view", view: { name: "Active things" } });
    if (copy?.type !== "view") throw new Error("Expected a view copy");
    const copiedFilter = copy.view.query.filter;
    if (!copiedFilter || copiedFilter.type !== "criterion") throw new Error("Expected criterion");
    (copiedFilter as { attribute: string }).attribute = "title";
    const sourceFilter = workspace.queries["query-open"].filter;
    expect(sourceFilter?.type === "criterion" && sourceFilter.attribute).toBe("status");
  });

  it("resolves copied shortcut metadata from its originating section", () => {
    const leaf = {
      id: navigationEntryId("users"),
      type: "leaf" as const,
      label: "Users",
      selection: { type: "view" as const, id: "users" },
    };
    const sections = [
      {
        id: navigationSectionId("administration"),
        label: "Administration",
        order: 1,
        roots: () => [leaf],
      },
    ];

    expect(leafForWorkspaceSource(sections, "administration/users")).toBe(leaf);
  });
});
