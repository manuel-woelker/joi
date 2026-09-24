import type {
  NavigationId,
  QueryDefinition,
  PresentationDefinition,
  ViewId,
  WorkspaceDocument,
  WorkspaceShortcutDraft,
  WorkspaceViewDraft,
} from "./model";
import { unwrap } from "solid-js/store";
import { generateKsuid } from "../entities/ksuid";

const nextId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export function cloneWorkspace(workspace: WorkspaceDocument): WorkspaceDocument {
  return cloneValue(workspace);
}

export function cloneValue<T>(value: T): T {
  return structuredClone(unwrap(value));
}

function containerFor(workspace: WorkspaceDocument, itemId: NavigationId): NavigationId[] | undefined {
  if (workspace.rootItems.includes(itemId)) return workspace.rootItems;
  for (const item of Object.values(workspace.navigation)) {
    if (item.type === "folder" && item.children.includes(itemId)) return item.children;
  }
  return undefined;
}

export function addFolder(workspace: WorkspaceDocument, name: string): NavigationId {
  const id = nextId("folder");
  workspace.navigation[id] = { id, type: "folder", name, children: [] };
  workspace.rootItems.push(id);
  return id;
}

export function addView(
  workspace: WorkspaceDocument,
  name: string,
  queryId: string,
  presentationId: string,
  parentId?: NavigationId,
): ViewId {
  const viewId = generateKsuid();
  const navigationId = nextId("nav");
  workspace.views[viewId] = { id: viewId, name, queryId, presentationId };
  workspace.navigation[navigationId] = { id: navigationId, type: "view", viewId };
  const parent = parentId ? workspace.navigation[parentId] : undefined;
  if (parent?.type === "folder") parent.children.push(navigationId);
  else workspace.rootItems.push(navigationId);
  return viewId;
}

export function addViewFromDraft(workspace: WorkspaceDocument, draft: WorkspaceViewDraft): ViewId {
  const queryId = nextId("query");
  const presentationId = nextId("presentation");
  workspace.queries[queryId] = { ...cloneValue(draft.query), id: queryId };
  workspace.presentations[presentationId] = { ...cloneValue(draft.presentation), id: presentationId };
  const viewId = addView(workspace, draft.name, queryId, presentationId);
  workspace.views[viewId].description = draft.description;
  workspace.views[viewId].sourceNavigationEntryId = draft.sourceNavigationEntryId;
  if (draft.sourceViewId && workspace.viewConfigs?.[draft.sourceViewId]) {
    workspace.viewConfigs[viewId] = cloneValue(workspace.viewConfigs[draft.sourceViewId]);
  }
  return viewId;
}

export function addShortcutFromDraft(workspace: WorkspaceDocument, draft: WorkspaceShortcutDraft): NavigationId {
  const id = generateKsuid();
  workspace.navigation[id] = {
    id,
    type: "shortcut",
    name: draft.name,
    description: draft.description,
    selection: cloneValue(draft.selection),
    sourceNavigationEntryId: draft.sourceNavigationEntryId,
  };
  workspace.rootItems.push(id);
  return id;
}

export function duplicateView(workspace: WorkspaceDocument, viewId: ViewId): ViewId | undefined {
  const source = workspace.views[viewId];
  const navigation = Object.values(workspace.navigation).find((item) => item.type === "view" && item.viewId === viewId);
  if (!source || !navigation) return undefined;
  const copyId = addView(workspace, `${source.name} copy`, source.queryId, source.presentationId);
  workspace.views[copyId].description = source.description;
  if (workspace.viewConfigs?.[viewId]) workspace.viewConfigs[copyId] = cloneValue(workspace.viewConfigs[viewId]);
  const copyNavigation = Object.values(workspace.navigation).find(
    (item) => item.type === "view" && item.viewId === copyId,
  );
  const container = containerFor(workspace, navigation.id);
  if (copyNavigation && container) {
    workspace.rootItems = workspace.rootItems.filter((id) => id !== copyNavigation.id);
    container.splice(container.indexOf(navigation.id) + 1, 0, copyNavigation.id);
  }
  return copyId;
}

export function deleteNavigationItem(workspace: WorkspaceDocument, itemId: NavigationId): ViewId | undefined {
  const item = workspace.navigation[itemId];
  if (!item || (item.type === "folder" && item.children.length > 0)) return undefined;
  const container = containerFor(workspace, itemId);
  if (container) container.splice(container.indexOf(itemId), 1);
  delete workspace.navigation[itemId];
  if (item.type === "view") {
    delete workspace.views[item.viewId];
    if (workspace.viewConfigs) delete workspace.viewConfigs[item.viewId];
    return item.viewId;
  }
  return undefined;
}

export function moveItem(workspace: WorkspaceDocument, itemId: NavigationId, direction: -1 | 1) {
  const container = containerFor(workspace, itemId);
  if (!container) return;
  const index = container.indexOf(itemId);
  const target = index + direction;
  if (target < 0 || target >= container.length) return;
  [container[index], container[target]] = [container[target], container[index]];
}

export function moveItemToFolder(workspace: WorkspaceDocument, itemId: NavigationId, folderId?: NavigationId) {
  const source = containerFor(workspace, itemId);
  const target = folderId ? workspace.navigation[folderId] : undefined;
  if (!source || (target && target.type !== "folder") || folderId === itemId) return;
  source.splice(source.indexOf(itemId), 1);
  if (target?.type === "folder") target.children.push(itemId);
  else workspace.rootItems.push(itemId);
}

export function moveItemToPosition(
  workspace: WorkspaceDocument,
  itemId: NavigationId,
  parentId: NavigationId | undefined,
  index: number,
) {
  const source = containerFor(workspace, itemId);
  const parent = parentId ? workspace.navigation[parentId] : undefined;
  if (!source || (parent && parent.type !== "folder") || parentId === itemId) return;
  const descendants = new Set<NavigationId>();
  const collect = (id: NavigationId) => {
    const item = workspace.navigation[id];
    if (item?.type !== "folder") return;
    for (const child of item.children) {
      descendants.add(child);
      collect(child);
    }
  };
  collect(itemId);
  if (parentId && descendants.has(parentId)) return;
  const sourceIndex = source.indexOf(itemId);
  source.splice(sourceIndex, 1);
  const target = parent?.type === "folder" ? parent.children : workspace.rootItems;
  const adjustedIndex = source === target && sourceIndex < index ? index - 1 : index;
  target.splice(Math.max(0, Math.min(adjustedIndex, target.length)), 0, itemId);
}

export function saveDefinitions(
  workspace: WorkspaceDocument,
  viewId: ViewId,
  query: QueryDefinition,
  presentation: PresentationDefinition,
  mode: "update" | "copy",
) {
  const view = workspace.views[viewId];
  if (!view) return;
  if (mode === "copy") {
    query.id = nextId("query");
    presentation.id = nextId("presentation");
    view.queryId = query.id;
    view.presentationId = presentation.id;
  }
  workspace.queries[query.id] = query;
  workspace.presentations[presentation.id] = presentation;
}
