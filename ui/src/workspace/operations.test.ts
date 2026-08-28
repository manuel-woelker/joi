import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addFolder,
  addView,
  deleteNavigationItem,
  duplicateView,
  moveItemToFolder,
  saveDefinitions,
} from "./operations";
import { createSeedWorkspace } from "./seed";

beforeEach(() =>
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn().mockReturnValueOnce("one").mockReturnValueOnce("two").mockReturnValue("three"),
  }),
);

describe("workspace operations", () => {
  it("creates folders and moves new views into them", () => {
    const workspace = createSeedWorkspace();
    const folderId = addFolder(workspace, "Planning");
    const viewId = addView(workspace, "Roadmap", "query-all", "presentation-table");
    const navigation = Object.values(workspace.navigation).find(
      (item) => item.type === "view" && item.viewId === viewId,
    )!;
    moveItemToFolder(workspace, navigation.id, folderId);
    expect(workspace.navigation[folderId]).toMatchObject({ type: "folder", children: [navigation.id] });
  });

  it("duplicates a view while reusing its definitions", () => {
    const workspace = createSeedWorkspace();
    const id = duplicateView(workspace, "view-active")!;
    expect(workspace.views[id]).toMatchObject({
      name: "Active issues copy",
      queryId: "query-open",
      presentationId: "presentation-table",
    });
  });

  it("only deletes empty folders", () => {
    const workspace = createSeedWorkspace();
    expect(deleteNavigationItem(workspace, "folder-work")).toBeUndefined();
    expect(workspace.navigation["folder-work"]).toBeDefined();
  });

  it("copies reusable definitions without changing another view", () => {
    const workspace = createSeedWorkspace();
    workspace.views["view-all"].queryId = "query-open";
    const query = structuredClone(workspace.queries["query-open"]);
    const presentation = structuredClone(workspace.presentations["presentation-table"]);
    query.name = "Private query";
    saveDefinitions(workspace, "view-active", query, presentation, "copy");
    expect(workspace.views["view-active"].queryId).not.toBe("query-open");
    expect(workspace.views["view-all"].queryId).toBe("query-open");
  });
});
