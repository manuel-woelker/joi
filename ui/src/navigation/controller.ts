import { createMemo, createSignal, onCleanup } from "solid-js";

import type { ViewId, WorkspaceDocument } from "../workspace/model";

export type NavigationSelection = { type: "view"; id: ViewId } | { type: "administration"; id: string };

export interface NavigationController {
  selection: () => NavigationSelection;
  selectedViewId: () => ViewId | undefined;
  selectedAdministrationId: () => string | undefined;
  selectView(id: ViewId): void;
  selectAdministration(id: string): void;
}

function selectionFromHash(workspace: WorkspaceDocument): NavigationSelection {
  const viewMatch = window.location.hash.match(/^#\/views\/(.+)$/);
  if (viewMatch?.[1] && workspace.views[viewMatch[1]]) return { type: "view", id: viewMatch[1] };

  const administrationMatch = window.location.hash.match(/^#\/administration\/(.+)$/);
  if (administrationMatch?.[1]) return { type: "administration", id: administrationMatch[1] };

  const id = workspace.favorites.find((candidate) => workspace.views[candidate]) ?? Object.keys(workspace.views)[0];
  return { type: "view", id };
}

export function createNavigationController(workspace: WorkspaceDocument): NavigationController {
  const [selection, setSelection] = createSignal(selectionFromHash(workspace));
  const selectedViewId = createMemo(() => {
    const current = selection();
    return current.type === "view" ? current.id : undefined;
  });
  const selectedAdministrationId = createMemo(() => {
    const current = selection();
    return current.type === "administration" ? current.id : undefined;
  });
  const onHashChange = () => setSelection(selectionFromHash(workspace));

  window.addEventListener("hashchange", onHashChange);
  onCleanup(() => window.removeEventListener("hashchange", onHashChange));

  return {
    selection,
    selectedViewId,
    selectedAdministrationId,
    selectView(id) {
      setSelection({ type: "view", id });
      window.location.hash = `/views/${id}`;
    },
    selectAdministration(id) {
      setSelection({ type: "administration", id });
      window.location.hash = `/administration/${id}`;
    },
  };
}
