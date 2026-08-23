import { createContext, createMemo, createSignal, onCleanup, useContext, type ParentProps } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import type { NavigationId, PresentationDefinition, QueryDefinition, ViewId, WorkspaceDocument } from "./model";
import { addFolder, addView, cloneValue, cloneWorkspace, deleteNavigationItem, duplicateView, moveItem, moveItemToFolder, saveDefinitions } from "./operations";
import { LocalWorkspaceRepository, type WorkspaceRepository } from "./repository";

export interface WorkspaceController {
  workspace: WorkspaceDocument;
  selectedViewId: () => ViewId | undefined;
  selectedView: () => WorkspaceDocument["views"][string] | undefined;
  warning: () => string | undefined;
  announcement: () => string;
  editorOpen: () => boolean;
  navigationOpen: () => boolean;
  search: () => string;
  sidebarWidth: () => number;
  expandedFolders: () => ReadonlySet<NavigationId>;
  setSearch(value: string): void;
  setSidebarWidth(value: number): void;
  toggleFolder(id: NavigationId): void;
  selectView(id: ViewId): void;
  setEditorOpen(open: boolean): void;
  setNavigationOpen(open: boolean): void;
  toggleFavorite(id: ViewId): void;
  createFolder(): void;
  createView(parentId?: NavigationId): void;
  renameItem(id: NavigationId): void;
  duplicate(id: ViewId): void;
  remove(id: NavigationId): void;
  undo(): void;
  move(id: NavigationId, direction: -1 | 1): void;
  moveToFolder(id: NavigationId, folderId?: NavigationId): void;
  saveView(name: string, description: string, query: QueryDefinition, presentation: PresentationDefinition, mode: "update" | "copy"): void;
  reset(): void;
}

const WorkspaceContext = createContext<WorkspaceController>();

function viewIdFromHash(workspace: WorkspaceDocument): ViewId | undefined {
  const match = window.location.hash.match(/^#\/views\/(.+)$/);
  if (match?.[1] && workspace.views[match[1]]) return match[1];
  return workspace.favorites.find((id) => workspace.views[id]) ?? Object.keys(workspace.views)[0];
}

function loadExpandedFolders(): NavigationId[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem("joi.expanded-folders") ?? "[]");
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
  } catch {
    return [];
  }
}

export function WorkspaceProvider(props: ParentProps<{ repository?: WorkspaceRepository }>) {
  const repository = props.repository ?? new LocalWorkspaceRepository();
  const loaded = repository.load();
  const [workspace, setWorkspace] = createStore(loaded.workspace);
  const [selectedViewId, setSelectedViewId] = createSignal<ViewId | undefined>(viewIdFromHash(workspace));
  const [warning, setWarning] = createSignal(loaded.warning);
  const [announcement, setAnnouncement] = createSignal("");
  const [editorOpen, setEditorOpen] = createSignal(false);
  const [navigationOpen, setNavigationOpen] = createSignal(false);
  const [search, setSearch] = createSignal("");
  const [sidebarWidth, setSidebarWidthSignal] = createSignal(Number(localStorage.getItem("joi.sidebar.width")) || 244);
  const [expandedFolderIds, setExpandedFolderIds] = createSignal<NavigationId[]>(loadExpandedFolders());
  const [undoSnapshot, setUndoSnapshot] = createSignal<WorkspaceDocument>();

  const selectedView = createMemo(() => {
    const id = selectedViewId();
    return id ? workspace.views[id] : undefined;
  });

  const commit = (change: (draft: WorkspaceDocument) => void) => {
    const draft = cloneWorkspace(workspace);
    change(draft);
    setWorkspace(reconcile(draft));
    repository.save(draft);
  };

  const selectView = (id: ViewId) => {
    if (!workspace.views[id]) return;
    setSelectedViewId(id);
    window.location.hash = `/views/${id}`;
    setNavigationOpen(false);
    setSearch("");
  };

  const onHashChange = () => {
    const id = viewIdFromHash(workspace);
    if (id) setSelectedViewId(id);
  };
  window.addEventListener("hashchange", onHashChange);
  onCleanup(() => window.removeEventListener("hashchange", onHashChange));

  const controller: WorkspaceController = {
    workspace,
    selectedViewId,
    selectedView,
    warning,
    announcement,
    editorOpen,
    navigationOpen,
    search,
    sidebarWidth,
    expandedFolders: () => new Set(expandedFolderIds()),
    setSearch,
    setSidebarWidth(value) {
      const width = Math.min(380, Math.max(200, value));
      setSidebarWidthSignal(width);
      localStorage.setItem("joi.sidebar.width", String(width));
    },
    toggleFolder(id) {
      const next = expandedFolderIds().includes(id) ? expandedFolderIds().filter((folderId) => folderId !== id) : [...expandedFolderIds(), id];
      setExpandedFolderIds(next);
      localStorage.setItem("joi.expanded-folders", JSON.stringify(next));
    },
    selectView,
    setEditorOpen,
    setNavigationOpen,
    toggleFavorite(id) {
      commit((draft) => {
        draft.favorites = draft.favorites.includes(id) ? draft.favorites.filter((favorite) => favorite !== id) : [...draft.favorites, id];
      });
      setAnnouncement("Favorites updated.");
    },
    createFolder() {
      const name = window.prompt("Folder name", "New folder")?.trim();
      if (!name) return;
      commit((draft) => { addFolder(draft, name); });
      setAnnouncement(`Folder ${name} created.`);
    },
    createView(parentId) {
      const name = window.prompt("View name", "New view")?.trim();
      const queryId = Object.keys(workspace.queries)[0];
      const presentationId = Object.keys(workspace.presentations)[0];
      if (!name || !queryId || !presentationId) return;
      let id = "";
      commit((draft) => { id = addView(draft, name, queryId, presentationId, parentId); });
      selectView(id);
      setEditorOpen(true);
      setAnnouncement(`View ${name} created.`);
    },
    renameItem(id) {
      const item = workspace.navigation[id];
      if (!item) return;
      const current = item.type === "folder" ? item.name : workspace.views[item.viewId]?.name;
      const name = window.prompt("New name", current)?.trim();
      if (!name) return;
      commit((draft) => {
        const draftItem = draft.navigation[id];
        if (draftItem?.type === "folder") draftItem.name = name;
        else if (draftItem?.type === "view") draft.views[draftItem.viewId].name = name;
      });
      setAnnouncement(`Renamed to ${name}.`);
    },
    duplicate(id) {
      let copyId: string | undefined;
      commit((draft) => { copyId = duplicateView(draft, id); });
      if (copyId) selectView(copyId);
      setAnnouncement("View duplicated.");
    },
    remove(id) {
      const item = workspace.navigation[id];
      if (!item) return;
      if (item.type === "folder" && item.children.length) {
        setAnnouncement("Only empty folders can be deleted.");
        return;
      }
      setUndoSnapshot(cloneWorkspace(workspace));
      let removedView: string | undefined;
      commit((draft) => { removedView = deleteNavigationItem(draft, id); });
      if (removedView === selectedViewId()) {
        const next = Object.keys(workspace.views).find((viewId) => viewId !== removedView);
        setSelectedViewId(next);
        if (next) window.location.hash = `/views/${next}`;
      }
      setAnnouncement("Item deleted. Undo is available.");
    },
    undo() {
      const snapshot = undoSnapshot();
      if (!snapshot) return;
      setWorkspace(reconcile(snapshot));
      repository.save(snapshot);
      setUndoSnapshot(undefined);
      setAnnouncement("Deletion undone.");
    },
    move(id, direction) {
      commit((draft) => moveItem(draft, id, direction));
      setAnnouncement("Navigation order updated.");
    },
    moveToFolder(id, folderId) {
      commit((draft) => moveItemToFolder(draft, id, folderId));
      setAnnouncement("Item moved.");
    },
    saveView(name, description, query, presentation, mode) {
      const id = selectedViewId();
      if (!id) return;
      commit((draft) => {
        draft.views[id].name = name;
        draft.views[id].description = description;
        saveDefinitions(draft, id, cloneValue(query), cloneValue(presentation), mode);
      });
      setEditorOpen(false);
      setAnnouncement(mode === "copy" ? "View saved with private definitions." : "Reusable definitions updated.");
    },
    reset() {
      const reset = repository.reset();
      setWorkspace(reconcile(reset));
      setWarning(undefined);
      const id = viewIdFromHash(reset);
      if (id) selectView(id);
      setAnnouncement("Workspace reset.");
    },
  };

  return <WorkspaceContext.Provider value={controller}>{props.children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceController {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("WorkspaceProvider is missing");
  return workspace;
}
