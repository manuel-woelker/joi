import type { NavigationLeafContribution, NavigationSectionContribution } from "./contribution";
import { leafEntries } from "./recent-views";
import type { WorkspaceDocument, WorkspaceEntryDraft, WorkspaceViewDraft } from "../saved-views/model";
import { cloneValue } from "../saved-views/operations";

export const workspaceEntryMimeType = "application/x-joi-workspace-entry";

export function leafForWorkspaceSource(
  sections: readonly NavigationSectionContribution[],
  sourceNavigationEntryId: string,
): NavigationLeafContribution | undefined {
  for (const section of sections) {
    const leaf = leafEntries(section.roots()).find(
      (candidate) => `${section.id}/${candidate.id}` === sourceNavigationEntryId,
    );
    if (leaf) return leaf;
  }
  return undefined;
}

export function copyForLeaf(leaf: NavigationLeafContribution, section: string): WorkspaceEntryDraft {
  return (
    leaf.copyToWorkspace?.() ?? {
      type: "shortcut",
      shortcut: {
        name: leaf.label,
        description: leaf.description,
        selection: leaf.selection,
        sourceNavigationEntryId: `${section}/${leaf.id}`,
      },
    }
  );
}

export function copyForWorkspaceView(workspace: WorkspaceDocument, viewId: string): WorkspaceEntryDraft | undefined {
  const view = workspace.views[viewId];
  if (!view) return undefined;
  const query = workspace.queries[view.queryId];
  const presentation = workspace.presentations[view.presentationId];
  if (!query || !presentation) return undefined;
  const draft: WorkspaceViewDraft = {
    name: view.name,
    description: view.description,
    query: {
      name: query.name,
      entityId: query.entityId,
      filters: cloneValue(query.filters),
      sorting: cloneValue(query.sorting),
    },
    presentation: {
      name: presentation.name,
      entityId: presentation.entityId,
      layout: presentation.layout,
      density: presentation.density,
      fields: cloneValue(presentation.fields),
    },
  };
  return { type: "view", view: draft };
}

export function writeWorkspaceCopy(event: DragEvent, draft: WorkspaceEntryDraft): void {
  event.dataTransfer?.setData(workspaceEntryMimeType, JSON.stringify(draft));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
}

export function readWorkspaceCopy(event: DragEvent): WorkspaceEntryDraft | undefined {
  const serialized = event.dataTransfer?.getData(workspaceEntryMimeType);
  if (!serialized) return undefined;
  try {
    const value = JSON.parse(serialized) as Partial<WorkspaceEntryDraft>;
    return value.type === "view" || value.type === "shortcut" ? (value as WorkspaceEntryDraft) : undefined;
  } catch {
    return undefined;
  }
}
