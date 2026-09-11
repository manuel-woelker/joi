import { createContext, createMemo, createSignal, onCleanup, useContext, type ParentProps } from "solid-js";

/** Route owner to which a record or creation route belongs. */
export type NavigationOwner = { type: "view" | "administration"; id: string };

/** Parsed, URL-backed selection represented by the application hash. */
export type NavigationSelection =
  | { type: "none" }
  | { type: "unknown"; hash: string }
  | { type: "view" | "administration"; id: string }
  | { type: "record"; owner: NavigationOwner; recordId: string }
  | { type: "create"; owner: NavigationOwner };

/** Reads and changes the current application route. */
export interface NavigationController {
  selection: () => NavigationSelection;
  selectedViewId: () => string | undefined;
  selectedAdministrationId: () => string | undefined;
  selectedRecordId: () => string | undefined;
  creatingRecord: () => boolean;
  selectView(id: string): void;
  selectAdministration(id: string): void;
  selectRecord(id: string): void;
  createRecord(): void;
  finishCreatingRecord(id: string): void;
  closeRecord(): void;
}

const NavigationContext = createContext<NavigationController>();

function selectionFromHash(): NavigationSelection {
  const viewCreateMatch = window.location.hash.match(/^#\/views\/([^/]+)\/new$/);
  if (viewCreateMatch?.[1]) return { type: "create", owner: { type: "view", id: viewCreateMatch[1] } };

  const administrationCreateMatch = window.location.hash.match(/^#\/administration\/([^/]+)\/new$/);
  if (administrationCreateMatch?.[1]) {
    return { type: "create", owner: { type: "administration", id: administrationCreateMatch[1] } };
  }

  const viewRecordMatch = window.location.hash.match(/^#\/views\/([^/]+)\/records\/(.+)$/);
  if (viewRecordMatch?.[1] && viewRecordMatch[2]) {
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
  if (viewMatch?.[1]) return { type: "view", id: viewMatch[1] };

  const administrationMatch = window.location.hash.match(/^#\/administration\/(.+)$/);
  if (administrationMatch?.[1]) return { type: "administration", id: administrationMatch[1] };

  return window.location.hash === "" || window.location.hash === "#"
    ? { type: "none" }
    : { type: "unknown", hash: window.location.hash };
}

/**
 * Creates a reactive hash navigation controller for the current window.
 * The controller removes its hash listener with its owning Solid root.
 */
export function createNavigationController(): NavigationController {
  const [selection, setSelection] = createSignal(selectionFromHash());
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
  const onHashChange = () => setSelection(selectionFromHash());

  window.addEventListener("hashchange", onHashChange);
  onCleanup(() => window.removeEventListener("hashchange", onHashChange));

  return {
    selection,
    selectedViewId,
    selectedAdministrationId,
    selectedRecordId: createMemo(() => {
      const current = selection();
      return current.type === "record" ? current.recordId : undefined;
    }),
    creatingRecord: createMemo(() => selection().type === "create"),
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
      if (current.type === "none" || current.type === "unknown") return;
      const owner =
        current.type === "record" || current.type === "create" ? current.owner : { type: current.type, id: current.id };
      setSelection({ type: "record", owner, recordId });
      window.location.hash = `/${owner.type === "view" ? "views" : "administration"}/${owner.id}/records/${encodeURIComponent(recordId)}`;
    },
    createRecord() {
      const current = selection();
      if (current.type === "none" || current.type === "unknown") return;
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

/** Makes a navigation controller available to descendant components. */
export function NavigationProvider(props: ParentProps<{ controller: NavigationController }>) {
  return <NavigationContext.Provider value={props.controller}>{props.children}</NavigationContext.Provider>;
}

/** Returns the current navigation controller or throws outside its provider. */
export function useNavigation(): NavigationController {
  const navigation = useContext(NavigationContext);
  if (!navigation) throw new Error("NavigationProvider is missing");
  return navigation;
}
