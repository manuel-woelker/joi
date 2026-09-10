import { createContext, createEffect, createMemo, createSignal, useContext, type ParentProps } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import { type NavigationController, useNavigation } from "../../../base/navigation";
import { usePluginRegistry } from "../../../base/plugin-registry-context";
import { savedViewDefaults } from "./contribution";
import { useEntityRegistry } from "../entities/entity-registry";
import type { NavigationId, PresentationDefinition, QueryDefinition, ViewId, WorkspaceDocument } from "./model";
import {
  addFolder,
  addView,
  cloneValue,
  cloneWorkspace,
  deleteNavigationItem,
  duplicateView,
  moveItem,
  moveItemToFolder,
  saveDefinitions,
} from "./operations";
import {
  LocalWorkspaceRepository,
  mergeSavedViewDefaults,
  validateWorkspace,
  type WorkspaceRepository,
} from "./repository";

export interface WorkspaceController {
  workspace: WorkspaceDocument;
  navigation: NavigationController;
  selectedView: () => WorkspaceDocument["views"][string] | undefined;
  warning: () => string | undefined;
  announcement: () => string;
  editorOpen: () => boolean;
  search: () => string;
  expandedFolders: () => ReadonlySet<NavigationId>;
  setSearch(value: string): void;
  toggleFolder(id: NavigationId): void;
  selectView(id: ViewId): void;
  selectAdministration(id: string): void;
  selectRecord(id: string): void;
  createRecord(): void;
  finishCreatingRecord(id: string): void;
  announce(message: string): void;
  closeRecord(): void;
  setEditorOpen(open: boolean): void;
  toggleFavorite(id: ViewId): void;
  createFolder(): void;
  createView(parentId?: NavigationId): void;
  renameItem(id: NavigationId): void;
  duplicate(id: ViewId): void;
  remove(id: NavigationId): void;
  undo(): void;
  move(id: NavigationId, direction: -1 | 1): void;
  moveToFolder(id: NavigationId, folderId?: NavigationId): void;
  saveView(
    name: string,
    description: string,
    query: QueryDefinition,
    presentation: PresentationDefinition,
    mode: "update" | "copy",
  ): void;
  reset(): void;
}

const WorkspaceContext = createContext<WorkspaceController>();

function loadExpandedFolders(): NavigationId[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem("joi.expanded-folders") ?? "[]");
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
  } catch {
    return [];
  }
}

export function WorkspaceProvider(props: ParentProps<{ repository?: WorkspaceRepository }>) {
  const pluginRegistry = usePluginRegistry();
  const entities = useEntityRegistry();
  const defaults = mergeSavedViewDefaults(pluginRegistry.extensions(savedViewDefaults));
  validateWorkspace(defaults, entities);
  const repository = props.repository ?? new LocalWorkspaceRepository(defaults);
  const loaded = repository.load();
  const [workspace, setWorkspace] = createStore(loaded.workspace);
  const navigation = useNavigation();
  const [warning, setWarning] = createSignal(loaded.warning);
  const [announcement, setAnnouncement] = createSignal("");
  const [editorOpen, setEditorOpen] = createSignal(false);
  const [search, setSearch] = createSignal("");
  const [expandedFolderIds, setExpandedFolderIds] = createSignal<NavigationId[]>(loadExpandedFolders());
  const [undoSnapshot, setUndoSnapshot] = createSignal<WorkspaceDocument>();

  createEffect(() => {
    if (navigation.selection().type !== "none") return;
    const id = workspace.favorites.find((candidate) => workspace.views[candidate]) ?? Object.keys(workspace.views)[0];
    if (id) navigation.selectView(id);
  });

  const selectedView = createMemo(() => {
    const id = navigation.selectedViewId();
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
    navigation.selectView(id);
    setSearch("");
  };

  const selectAdministration = (id: string) => {
    navigation.selectAdministration(id);
    setSearch("");
  };

  const controller: WorkspaceController = {
    workspace,
    navigation,
    selectedView,
    warning,
    announcement,
    editorOpen,
    search,
    expandedFolders: () => new Set(expandedFolderIds()),
    setSearch,
    toggleFolder(id) {
      const next = expandedFolderIds().includes(id)
        ? expandedFolderIds().filter((folderId) => folderId !== id)
        : [...expandedFolderIds(), id];
      setExpandedFolderIds(next);
      localStorage.setItem("joi.expanded-folders", JSON.stringify(next));
    },
    selectView,
    selectAdministration,
    selectRecord(id) {
      navigation.selectRecord(id);
      setSearch("");
    },
    createRecord() {
      navigation.createRecord();
      setSearch("");
    },
    finishCreatingRecord(id) {
      navigation.finishCreatingRecord(id);
    },
    announce(message) {
      setAnnouncement(message);
    },
    closeRecord() {
      navigation.closeRecord();
    },
    setEditorOpen,
    toggleFavorite(id) {
      commit((draft) => {
        draft.favorites = draft.favorites.includes(id)
          ? draft.favorites.filter((favorite) => favorite !== id)
          : [...draft.favorites, id];
      });
      setAnnouncement("Favorites updated.");
    },
    createFolder() {
      const name = window.prompt("Folder name", "New folder")?.trim();
      if (!name) return;
      commit((draft) => {
        addFolder(draft, name);
      });
      setAnnouncement(`Folder ${name} created.`);
    },
    createView(parentId) {
      const name = window.prompt("View name", "New view")?.trim();
      const queryId = Object.keys(workspace.queries)[0];
      const presentationId = Object.keys(workspace.presentations)[0];
      if (!name || !queryId || !presentationId) return;
      let id = "";
      commit((draft) => {
        id = addView(draft, name, queryId, presentationId, parentId);
      });
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
      commit((draft) => {
        copyId = duplicateView(draft, id);
      });
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
      commit((draft) => {
        removedView = deleteNavigationItem(draft, id);
      });
      if (removedView === navigation.selectedViewId()) {
        const next = Object.keys(workspace.views).find((viewId) => viewId !== removedView);
        if (next) selectView(next);
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
      const id = navigation.selectedViewId();
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
      const id = navigation.selectedViewId();
      if (id && reset.views[id]) selectView(id);
      else selectView(Object.keys(reset.views)[0]);
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
