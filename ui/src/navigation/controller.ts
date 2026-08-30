import { createMemo, createSignal, onCleanup } from "solid-js";

import type { ViewId, WorkspaceDocument } from "../workspace/model";

export type NavigationSelection =
  | { type: "view"; id: ViewId }
  | { type: "administration"; id: string }
  | { type: "record"; owner: NavigationOwner; recordId: string }
  | { type: "create"; owner: NavigationOwner };

type NavigationOwner = { type: "view"; id: ViewId } | { type: "administration"; id: string };

export interface NavigationController {
  selection: () => NavigationSelection;
  selectedViewId: () => ViewId | undefined;
  selectedAdministrationId: () => string | undefined;
  selectedRecordId: () => string | undefined;
  creatingRecord: () => boolean;
  selectView(id: ViewId): void;
  selectAdministration(id: string): void;
  selectRecord(id: string): void;
  createRecord(): void;
  finishCreatingRecord(id: string): void;
  closeRecord(): void;
}

function selectionFromHash(workspace: WorkspaceDocument): NavigationSelection {
  const viewCreateMatch = window.location.hash.match(/^#\/views\/([^/]+)\/new$/);
  if (viewCreateMatch?.[1] && workspace.views[viewCreateMatch[1]]) {
    return { type: "create", owner: { type: "view", id: viewCreateMatch[1] } };
  }
  const administrationCreateMatch = window.location.hash.match(/^#\/administration\/([^/]+)\/new$/);
  if (administrationCreateMatch?.[1]) {
    return { type: "create", owner: { type: "administration", id: administrationCreateMatch[1] } };
  }
  const viewRecordMatch = window.location.hash.match(/^#\/views\/([^/]+)\/records\/(.+)$/);
  if (viewRecordMatch?.[1] && viewRecordMatch[2] && workspace.views[viewRecordMatch[1]]) {
    return {
      type: "record",
      owner: { type: "view", id: viewRecordMatch[1] },
      recordId: decodeURIComponent(viewRecordMatch[2]),
    };
  }

  const administrationRecordMatch = window.location.hash.match(/^#\/administration\/([^/]+)\/records\/(.+)$/);
  if (administrationRecordMatch?.[1] && administrationRecordMatch[2]) {
    return {
      type: "record",
      owner: { type: "administration", id: administrationRecordMatch[1] },
      recordId: decodeURIComponent(administrationRecordMatch[2]),
    };
  }

  const viewMatch = window.location.hash.match(/^#\/views\/([^/]+)$/);
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
    return current.type === "view"
      ? current.id
      : (current.type === "record" || current.type === "create") && current.owner.type === "view"
        ? current.owner.id
        : undefined;
  });
  const selectedAdministrationId = createMemo(() => {
    const current = selection();
    return current.type === "administration"
      ? current.id
      : (current.type === "record" || current.type === "create") && current.owner.type === "administration"
        ? current.owner.id
        : undefined;
  });
  const selectedRecordId = createMemo(() => {
    const current = selection();
    return current.type === "record" ? current.recordId : undefined;
  });
  const creatingRecord = createMemo(() => selection().type === "create");
  const onHashChange = () => setSelection(selectionFromHash(workspace));

  window.addEventListener("hashchange", onHashChange);
  onCleanup(() => window.removeEventListener("hashchange", onHashChange));

  return {
    selection,
    selectedViewId,
    selectedAdministrationId,
    selectedRecordId,
    creatingRecord,
    selectView(id) {
      setSelection({ type: "view", id });
      window.location.hash = `/views/${id}`;
    },
    selectAdministration(id) {
      setSelection({ type: "administration", id });
      window.location.hash = `/administration/${id}`;
    },
    selectRecord(recordId) {
      const current = selection();
      const owner =
        current.type === "record" || current.type === "create" ? current.owner : { type: current.type, id: current.id };
      setSelection({ type: "record", owner, recordId });
      window.location.hash = `/${owner.type === "view" ? "views" : "administration"}/${owner.id}/records/${encodeURIComponent(recordId)}`;
    },
    createRecord() {
      const current = selection();
      const owner =
        current.type === "record" || current.type === "create" ? current.owner : { type: current.type, id: current.id };
      setSelection({ type: "create", owner });
      window.location.hash = `/${owner.type === "view" ? "views" : "administration"}/${owner.id}/new`;
    },
    finishCreatingRecord(recordId) {
      const current = selection();
      if (current.type !== "create") return;
      setSelection({ type: "record", owner: current.owner, recordId });
      const hash = `#/${current.owner.type === "view" ? "views" : "administration"}/${current.owner.id}/records/${encodeURIComponent(recordId)}`;
      window.history.replaceState(undefined, "", hash);
    },
    closeRecord() {
      const current = selection();
      if (current.type !== "record" && current.type !== "create") return;
      setSelection(current.owner);
      window.location.hash = `/${current.owner.type === "view" ? "views" : "administration"}/${current.owner.id}`;
    },
  };
}
