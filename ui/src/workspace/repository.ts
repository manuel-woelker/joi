import type { WorkspaceDocument } from "./model";
import { createSeedWorkspace } from "./seed";

export interface WorkspaceRepository {
  load(): { workspace: WorkspaceDocument; warning?: string };
  save(workspace: WorkspaceDocument): void;
  reset(): WorkspaceDocument;
}

export const WORKSPACE_STORAGE_KEY = "joi.workspace.v2";

export function isWorkspaceDocument(value: unknown): value is WorkspaceDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<WorkspaceDocument>;
  return document.version === 2 && !!document.queries && !!document.presentations &&
    !!document.views && !!document.navigation && Array.isArray(document.rootItems) &&
    Array.isArray(document.favorites);
}

export class LocalWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly storage: Storage = window.localStorage) {}

  load() {
    const stored = this.storage.getItem(WORKSPACE_STORAGE_KEY);
    if (!stored) return { workspace: createSeedWorkspace() };

    try {
      const parsed: unknown = JSON.parse(stored);
      if (isWorkspaceDocument(parsed)) return { workspace: parsed };
    } catch {
      // Fall through to a recoverable seed workspace.
    }
    return { workspace: createSeedWorkspace(), warning: "Saved workspace data could not be loaded. A fresh workspace is shown instead." };
  }

  save(workspace: WorkspaceDocument) {
    this.storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
  }

  reset() {
    const workspace = createSeedWorkspace();
    this.save(workspace);
    return workspace;
  }
}
