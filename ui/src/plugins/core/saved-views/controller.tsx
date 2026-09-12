import { createContext, createEffect, createMemo, createSignal, useContext, type ParentProps } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import { type NavigationController, useNavigation } from "../../../base/navigation";
import { usePluginRegistry } from "../../../base/plugin-registry-context";
import { savedViewDefaults } from "./contribution";
import { useEntityRegistry } from "../entities/entity-registry";
import type {
  NavigationId,
  WorkspaceEntryDraft,
  PresentationDefinition,
  QueryDefinition,
  ViewId,
  WorkspaceDocument,
} from "./model";
import {
  addFolder,
  addShortcutFromDraft,
  addView,
  addViewFromDraft,
  cloneValue,
  cloneWorkspace,
  deleteNavigationItem,
  duplicateView,
  moveItem,
  moveItemToFolder,
  moveItemToPosition,
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
  setExpandedFolders(ids: ReadonlySet<NavigationId>): void;
  selectView(id: ViewId): void;
  selectRecord(id: string): void;
  createRecord(): void;
  finishCreatingRecord(id: string): void;
  announce(message: string): void;
  closeRecord(): void;
  setEditorOpen(open: boolean): void;
  createFolder(): void;
  createView(parentId?: NavigationId): void;
  renameItem(id: NavigationId): void;
  duplicate(id: ViewId): void;
  remove(id: NavigationId): void;
  undo(): void;
  move(id: NavigationId, direction: -1 | 1): void;
  moveToFolder(id: NavigationId, folderId?: NavigationId): void;
  moveToPosition(id: NavigationId, parentId: NavigationId | undefined, index: number): void;
  copyEntry(draft: WorkspaceEntryDraft, parentId?: NavigationId, index?: number): string;
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
    const current = navigation.selection();
    const route = navigation.activeRoute();
    if (route?.source !== "workspace") return;
    const item = workspace.navigation[route.id];
    if (item?.type !== "shortcut") return;
    const target =
      item.selection.type === "record" || item.selection.type === "create" ? item.selection.owner : item.selection;
    if (target.type === "view" && (current.type !== "view" || current.id !== target.id)) {
      navigation.selectView(target.id, route);
    }
  });

  createEffect(() => {
    if (navigation.selection().type !== "none") return;
    const id = Object.values(workspace.navigation).find((item) => item.type === "view")?.viewId;
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
    setExpandedFolders(ids) {
      const next = [...ids];
      setExpandedFolderIds(next);
      localStorage.setItem("joi.expanded-folders", JSON.stringify(next));
    },
    selectView,
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
      const current =
        item.type === "folder" ? item.name : item.type === "view" ? workspace.views[item.viewId]?.name : item.name;
      const name = window.prompt("New name", current)?.trim();
      if (!name) return;
      commit((draft) => {
        const draftItem = draft.navigation[id];
        if (draftItem?.type === "folder") draftItem.name = name;
        else if (draftItem?.type === "view") draft.views[draftItem.viewId].name = name;
        else if (draftItem?.type === "shortcut") draftItem.name = name;
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
      const removedActiveShortcut = item.type === "shortcut" && navigation.activeRoute()?.id === item.id;
      if ((removedView !== undefined && removedView === navigation.selectedViewId()) || removedActiveShortcut) {
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
    moveToPosition(id, parentId, index) {
      commit((draft) => moveItemToPosition(draft, id, parentId, index));
      setAnnouncement("Navigation item moved.");
    },
    copyEntry(entryDraft, parentId, index) {
      let id = "";
      commit((draft) => {
        id =
          entryDraft.type === "view"
            ? addViewFromDraft(draft, entryDraft.view)
            : addShortcutFromDraft(draft, entryDraft.shortcut);
        if (parentId !== undefined || index !== undefined) {
          const navigationId =
            entryDraft.type === "view"
              ? Object.values(draft.navigation).find((item) => item.type === "view" && item.viewId === id)?.id
              : id;
          if (navigationId) moveItemToPosition(draft, navigationId, parentId, index ?? 0);
        }
      });
      if (entryDraft.type === "view") selectView(id);
      else {
        const target = entryDraft.shortcut.selection;
        const route = { source: "workspace" as const, section: "workspace", id };
        if (target.type === "view") navigation.selectView(target.id, route);
      }
      const name = entryDraft.type === "view" ? entryDraft.view.name : entryDraft.shortcut.name;
      setAnnouncement(`Added ${name} to My workspace.`);
      return id;
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
      else {
        const first = Object.values(reset.navigation).find((item) => item.type === "view");
        if (first?.type === "view") selectView(first.viewId);
      }
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
