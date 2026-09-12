import { describe, expect, it } from "vitest";

import {
  LEGACY_WORKSPACE_STORAGE_KEYS,
  LocalWorkspaceRepository,
  WORKSPACE_STORAGE_KEY,
  validateWorkspace,
} from "./repository";
import { createTestWorkspace } from "./test-fixtures";
import { testEntity } from "./test-fixtures";
import { EntityRegistry } from "../entities/entity-registry";

describe("LocalWorkspaceRepository", () => {
  it("round trips a workspace", () => {
    const repository = new LocalWorkspaceRepository(createTestWorkspace(), localStorage);
    const workspace = repository.reset();
    workspace.views["view-active"].name = "Changed";
    repository.save(workspace);
    expect(repository.load().workspace.views["view-active"].name).toBe("Changed");
  });

  it("normalizes legacy administration shortcuts to regular views", () => {
    const workspace = createTestWorkspace();
    workspace.navigation.shortcut = {
      id: "shortcut",
      type: "shortcut",
      name: "Users",
      selection: { type: "administration", id: "users" } as never,
      sourceNavigationEntryId: "administration/users",
    };
    workspace.rootItems.push("shortcut");
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));

    const loaded = new LocalWorkspaceRepository(createTestWorkspace(), localStorage).load();

    expect(loaded.workspace.navigation.shortcut).toMatchObject({ selection: { type: "view", id: "users" } });
  });

  it("recovers safely from malformed data", () => {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, "not json");
    const loaded = new LocalWorkspaceRepository(createTestWorkspace(), localStorage).load();
    expect(loaded.warning).toContain("could not be loaded");
    expect(loaded.workspace.version).toBe(4);
  });

  it("rejects unsupported versions", () => {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ version: 1 }));
    expect(new LocalWorkspaceRepository(createTestWorkspace(), localStorage).load().warning).toBeDefined();
  });

  it("migrates legacy ticket sources to entity IDs", () => {
    const legacy = structuredClone(createTestWorkspace()) as unknown as Record<string, unknown>;
    legacy.version = 2;
    for (const definitions of [legacy.queries, legacy.presentations]) {
      for (const definition of Object.values(definitions as Record<string, Record<string, unknown>>)) {
        definition.source = definition.entityId;
        delete definition.entityId;
      }
    }
    localStorage.setItem(LEGACY_WORKSPACE_STORAGE_KEYS[1], JSON.stringify(legacy));

    const loaded = new LocalWorkspaceRepository(createTestWorkspace(), localStorage).load();

    expect(loaded.workspace.version).toBe(4);
    expect(loaded.workspace.queries["query-open"].entityId).toBe("things");
    expect(localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBeTruthy();
  });

  it("migrates version 3 workspaces without losing navigation", () => {
    const legacy = structuredClone(createTestWorkspace()) as unknown as Record<string, unknown>;
    legacy.version = 3;
    legacy.favorites = ["view-active"];
    localStorage.setItem(LEGACY_WORKSPACE_STORAGE_KEYS[0], JSON.stringify(legacy));

    const loaded = new LocalWorkspaceRepository(createTestWorkspace(), localStorage).load();

    expect(loaded.workspace.version).toBe(4);
    expect(loaded.workspace.rootItems).toEqual(createTestWorkspace().rootItems);
    expect("favorites" in loaded.workspace).toBe(false);
  });

  it("rejects defaults that reference an unknown entity", () => {
    expect(() => validateWorkspace(createTestWorkspace(), new EntityRegistry([]))).toThrow(
      "Entity 'things' is not registered",
    );
  });

  it("rejects broken saved-view references", () => {
    const workspace = createTestWorkspace();
    workspace.views["view-active"].queryId = "missing";
    expect(() => validateWorkspace(workspace, new EntityRegistry([testEntity]))).toThrow(
      "View 'view-active' references unknown query 'missing'",
    );
  });
});
