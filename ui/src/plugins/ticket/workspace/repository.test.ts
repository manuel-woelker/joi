import { describe, expect, it } from "vitest";

import { LocalWorkspaceRepository, WORKSPACE_STORAGE_KEY } from "./repository";

describe("LocalWorkspaceRepository", () => {
  it("round trips a workspace", () => {
    const repository = new LocalWorkspaceRepository(localStorage);
    const workspace = repository.reset();
    workspace.views["view-active"].name = "Changed";
    repository.save(workspace);
    expect(repository.load().workspace.views["view-active"].name).toBe("Changed");
  });

  it("recovers safely from malformed data", () => {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, "not json");
    const loaded = new LocalWorkspaceRepository(localStorage).load();
    expect(loaded.warning).toContain("could not be loaded");
    expect(loaded.workspace.version).toBe(2);
  });

  it("rejects unsupported versions", () => {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ version: 1 }));
    expect(new LocalWorkspaceRepository(localStorage).load().warning).toBeDefined();
  });
});
