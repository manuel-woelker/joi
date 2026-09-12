import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addFolder,
  addShortcutFromDraft,
  addView,
  deleteNavigationItem,
  duplicateView,
  moveItemToFolder,
  moveItemToPosition,
  saveDefinitions,
} from "./operations";
import { createTestWorkspace } from "./test-fixtures";

function fillBytes<T extends ArrayBufferView>(bytes: T, value: number): T {
  new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).fill(value);
  return bytes;
}

beforeEach(() =>
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn().mockReturnValueOnce("one").mockReturnValueOnce("two").mockReturnValue("three"),
    getRandomValues: vi.fn((bytes: Uint8Array) => bytes.fill(1)),
  }),
);

describe("workspace operations", () => {
  it("creates folders and moves new views into them", () => {
    const workspace = createTestWorkspace();
    const folderId = addFolder(workspace, "Planning");
    const viewId = addView(workspace, "Roadmap", "query-all", "presentation-table");
    const navigation = Object.values(workspace.navigation).find(
      (item) => item.type === "view" && item.viewId === viewId,
    )!;
    moveItemToFolder(workspace, navigation.id, folderId);
    expect(workspace.navigation[folderId]).toMatchObject({ type: "folder", children: [navigation.id] });
  });

  it("adds persistent navigation shortcuts", () => {
    const workspace = createTestWorkspace();
    const id = addShortcutFromDraft(workspace, {
      name: "Users",
      selection: { type: "view", id: "users" },
      sourceNavigationEntryId: "administration/users",
    });

    expect(workspace.rootItems).toContain(id);
    expect(workspace.navigation[id]).toMatchObject({
      id,
      type: "shortcut",
      name: "Users",
      selection: { type: "view", id: "users" },
    });
  });

  it("allows multiple shortcuts from the same navigation source", () => {
    vi.mocked(crypto.getRandomValues)
      .mockImplementationOnce((bytes) => fillBytes(bytes, 1))
      .mockImplementationOnce((bytes) => fillBytes(bytes, 2));
    const workspace = createTestWorkspace();
    const source = {
      name: "Users",
      selection: { type: "view" as const, id: "users" },
      sourceNavigationEntryId: "administration/users",
    };

    const first = addShortcutFromDraft(workspace, source);
    const second = addShortcutFromDraft(workspace, source);

    expect(second).not.toBe(first);
    expect(workspace.rootItems).toEqual(expect.arrayContaining([first, second]));
  });

  it("moves entries to an exact normalized tree position", () => {
    const workspace = createTestWorkspace();
    moveItemToPosition(workspace, "nav-all", "folder-work", 1);
    expect(workspace.navigation["folder-work"]).toMatchObject({
      type: "folder",
      children: ["nav-active", "nav-all"],
    });
    expect(workspace.rootItems).not.toContain("nav-all");
  });

  it("rejects moving a folder into its own descendant", () => {
    const workspace = createTestWorkspace();
    moveItemToPosition(workspace, "folder-work", "folder-work", 0);
    expect(workspace.rootItems).toContain("folder-work");
  });

  it("duplicates a view while reusing its definitions", () => {
    const workspace = createTestWorkspace();
    const id = duplicateView(workspace, "view-active")!;
    expect(workspace.views[id]).toMatchObject({
      name: "Active things copy",
      queryId: "query-open",
      presentationId: "presentation-table",
    });
  });

  it("only deletes empty folders", () => {
    const workspace = createTestWorkspace();
    expect(deleteNavigationItem(workspace, "folder-work")).toBeUndefined();
    expect(workspace.navigation["folder-work"]).toBeDefined();
  });

  it("copies reusable definitions without changing another view", () => {
    const workspace = createTestWorkspace();
    workspace.views["view-all"].queryId = "query-open";
    const query = structuredClone(workspace.queries["query-open"]);
    const presentation = structuredClone(workspace.presentations["presentation-table"]);
    query.name = "Private query";
    saveDefinitions(workspace, "view-active", query, presentation, "copy");
    expect(workspace.views["view-active"].queryId).not.toBe("query-open");
    expect(workspace.views["view-all"].queryId).toBe("query-open");
  });
});
