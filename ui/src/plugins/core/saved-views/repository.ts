import { entityId } from "../entities/entity-description";
import type { SavedViewDefaultsContribution } from "./contribution";
import type { WorkspaceDocument } from "./model";
import type { EntityRegistry } from "../entities/entity-registry";
import { validatePresentation } from "./query";

export interface WorkspaceRepository {
  load(): { workspace: WorkspaceDocument; warning?: string };
  save(workspace: WorkspaceDocument): void;
  reset(): WorkspaceDocument;
}

export const WORKSPACE_STORAGE_KEY = "joi.workspace.v4";
export const LEGACY_WORKSPACE_STORAGE_KEYS = ["joi.workspace.v3", "joi.workspace.v2"] as const;

export function mergeSavedViewDefaults(contributions: readonly SavedViewDefaultsContribution[]): WorkspaceDocument {
  const workspace: WorkspaceDocument = {
    version: 4,
    queries: {},
    presentations: {},
    views: {},
    navigation: {},
    rootItems: [],
  };
  for (const contribution of contributions) {
    mergeRecord(workspace.queries, contribution.workspace.queries, contribution.id, "query");
    mergeRecord(workspace.presentations, contribution.workspace.presentations, contribution.id, "presentation");
    mergeRecord(workspace.views, contribution.workspace.views, contribution.id, "view");
    mergeRecord(workspace.navigation, contribution.workspace.navigation, contribution.id, "navigation item");
    workspace.rootItems.push(...contribution.workspace.rootItems);
  }
  return workspace;
}

export function validateWorkspace(workspace: WorkspaceDocument, entities: EntityRegistry): void {
  for (const [id, query] of Object.entries(workspace.queries)) {
    if (query.id !== id) throw new Error(`Query key '${id}' does not match its ID '${query.id}'`);
    entities.require(query.entityId);
  }
  for (const [id, presentation] of Object.entries(workspace.presentations)) {
    if (presentation.id !== id) throw new Error(`Presentation key '${id}' does not match its ID '${presentation.id}'`);
    entities.require(presentation.entityId);
  }
  for (const [id, view] of Object.entries(workspace.views)) {
    if (view.id !== id) throw new Error(`View key '${id}' does not match its ID '${view.id}'`);
    const query = workspace.queries[view.queryId];
    const presentation = workspace.presentations[view.presentationId];
    if (!query) throw new Error(`View '${id}' references unknown query '${view.queryId}'`);
    if (!presentation) throw new Error(`View '${id}' references unknown presentation '${view.presentationId}'`);
    const error = validatePresentation(query, presentation, entities.require(query.entityId));
    if (error) throw new Error(`View '${id}' is invalid: ${error}`);
  }
  for (const [id, item] of Object.entries(workspace.navigation)) {
    if (item.id !== id) throw new Error(`Navigation key '${id}' does not match its ID '${item.id}'`);
    if (item.type === "view" && !workspace.views[item.viewId]) {
      throw new Error(`Navigation item '${id}' references unknown view '${item.viewId}'`);
    }
    if (item.type === "folder") {
      for (const child of item.children) {
        if (!workspace.navigation[child]) throw new Error(`Folder '${id}' references unknown item '${child}'`);
      }
    }
  }
  for (const root of workspace.rootItems) {
    if (!workspace.navigation[root]) throw new Error(`Workspace root references unknown item '${root}'`);
  }
}

function mergeRecord<T>(target: Record<string, T>, source: Record<string, T>, contribution: string, kind: string) {
  for (const [id, value] of Object.entries(source)) {
    if (id in target) throw new Error(`Saved-view defaults '${contribution}' repeat ${kind} ID '${id}'`);
    target[id] = value;
  }
}

export function isWorkspaceDocument(value: unknown): value is WorkspaceDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<WorkspaceDocument>;
  return (
    document.version === 4 &&
    !!document.queries &&
    !!document.presentations &&
    !!document.views &&
    !!document.navigation &&
    Array.isArray(document.rootItems)
  );
}

function migrateLegacyWorkspace(value: unknown): WorkspaceDocument | undefined {
  if (!value || typeof value !== "object") return undefined;
  const legacy = value as Record<string, unknown>;
  if ((legacy.version !== 2 && legacy.version !== 3) || !legacy.queries || !legacy.presentations) return undefined;
  const migrated = structuredClone(legacy) as Record<string, unknown>;
  if (legacy.version === 2) {
    for (const definitions of [migrated.queries, migrated.presentations]) {
      if (!definitions || typeof definitions !== "object") return undefined;
      for (const definition of Object.values(definitions)) {
        if (!definition || typeof definition !== "object") return undefined;
        const record = definition as Record<string, unknown>;
        record.entityId = entityId(String(record.source));
        delete record.source;
      }
    }
  }
  migrated.version = 4;
  delete migrated.favorites;
  return isWorkspaceDocument(migrated) ? migrated : undefined;
}

export class LocalWorkspaceRepository implements WorkspaceRepository {
  constructor(
    private readonly defaults: WorkspaceDocument,
    private readonly storage: Storage = window.localStorage,
  ) {}

  load() {
    const stored = this.storage.getItem(WORKSPACE_STORAGE_KEY);
    if (stored) {
      try {
        const parsed: unknown = JSON.parse(stored);
        if (isWorkspaceDocument(parsed)) return { workspace: parsed };
      } catch {
        // Fall through to a recoverable default workspace.
      }
      return {
        workspace: structuredClone(this.defaults),
        warning: "Saved workspace data could not be loaded. A fresh workspace is shown instead.",
      };
    }

    for (const legacyKey of LEGACY_WORKSPACE_STORAGE_KEYS) {
      const legacy = this.storage.getItem(legacyKey);
      if (!legacy) continue;
      try {
        const workspace = migrateLegacyWorkspace(JSON.parse(legacy));
        if (workspace) {
          this.save(workspace);
          return { workspace };
        }
      } catch {
        // Fall through to a recoverable default workspace.
      }
    }
    return { workspace: structuredClone(this.defaults) };
  }

  save(workspace: WorkspaceDocument) {
    this.storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
  }

  reset() {
    const workspace = structuredClone(this.defaults);
    this.save(workspace);
    return workspace;
  }
}
