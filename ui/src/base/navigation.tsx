import { createContext, createMemo, createSignal, onCleanup, useContext, type ParentProps } from "solid-js";

export interface NavigationRoute {
  readonly source: "workspace" | "system" | "recent";
  readonly section: string;
  readonly id: string;
}

export type NavigationOwner = { type: "view"; id: string; route?: NavigationRoute };

export type NavigationSelection =
  | { type: "none" }
  | { type: "unknown"; hash: string }
  | NavigationOwner
  | { type: "record"; owner: NavigationOwner; recordId: string }
  | { type: "create"; owner: NavigationOwner };

export interface NavigationController {
  selection: () => NavigationSelection;
  selectedViewId: () => string | undefined;
  selectedRecordId: () => string | undefined;
  creatingRecord: () => boolean;
  activeRoute: () => NavigationRoute | undefined;
  hashState: (key: string) => string | undefined;
  setHashState(key: string, value?: string): void;
  selectView(id: string, route?: NavigationRoute): void;
  selectRecord(id: string): void;
  createRecord(): void;
  finishCreatingRecord(id: string): void;
  closeRecord(): void;
}

const NavigationContext = createContext<NavigationController>();

function selectionFromHash(): NavigationSelection {
  const parts = hashPath().replace(/^\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return { type: "none" };
  const recent = parts[0] === "recent";
  const offset = recent ? 1 : 0;
  const section = parts[offset];
  const id = parts[offset + 1];
  if (!section || !id) return { type: "unknown", hash: window.location.hash };
  const route: NavigationRoute = {
    source: recent ? "recent" : section === "workspace" ? "workspace" : "system",
    section,
    id,
  };
  const owner: NavigationOwner = { type: "view", id, route };
  const suffix = parts.slice(offset + 2);
  if (suffix[0] === "new" && suffix.length === 1) return { type: "create", owner };
  if (suffix[0] === "records" && suffix[1] && suffix.length === 2) {
    return { type: "record", owner, recordId: suffix[1] };
  }
  return suffix.length ? { type: "unknown", hash: window.location.hash } : owner;
}

/** Creates a reactive hash navigation controller for the current window. */
export function createNavigationController(): NavigationController {
  const [selection, setSelection] = createSignal(selectionFromHash());
  const [routeState, setRouteState] = createSignal(hashParameters());
  const selectedViewId = createMemo(() => {
    const current = selection();
    return current.type === "view"
      ? current.id
      : (current.type === "record" || current.type === "create") && current.owner.type === "view"
        ? current.owner.id
        : undefined;
  });
  const onHashChange = () => {
    setSelection(selectionFromHash());
    setRouteState(hashParameters());
  };
  window.addEventListener("hashchange", onHashChange);
  onCleanup(() => window.removeEventListener("hashchange", onHashChange));

  return {
    selection,
    selectedViewId,
    selectedRecordId: createMemo(() => {
      const current = selection();
      return current.type === "record" ? current.recordId : undefined;
    }),
    creatingRecord: createMemo(() => selection().type === "create"),
    activeRoute: createMemo(() => {
      const current = selection();
      return current.type === "record" || current.type === "create"
        ? current.owner.route
        : current.type === "view"
          ? current.route
          : undefined;
    }),
    hashState: (key) => routeState().get(key) ?? undefined,
    setHashState(key, value) {
      const parameters = hashParameters();
      if (value === undefined) parameters.delete(key);
      else parameters.set(key, value);
      const query = parameters.toString();
      const hash = `#${hashPath()}${query ? `?${query}` : ""}`;
      window.history.replaceState(undefined, "", hash);
      setRouteState(parameters);
    },
    selectView(id, route = { source: "workspace", section: "workspace", id }) {
      setSelection({ type: "view", id, route });
      setRouteState(new URLSearchParams());
      window.location.hash = routeHash(route);
    },
    selectRecord(recordId) {
      const current = selection();
      if (current.type === "none" || current.type === "unknown") return;
      const owner = current.type === "record" || current.type === "create" ? current.owner : current;
      setSelection({ type: "record", owner, recordId });
      setRouteState(new URLSearchParams());
      window.location.hash = `${routeHash(ownerRoute(owner))}/records/${encodeURIComponent(recordId)}`;
    },
    createRecord() {
      const current = selection();
      if (current.type === "none" || current.type === "unknown") return;
      const owner = current.type === "record" || current.type === "create" ? current.owner : current;
      setSelection({ type: "create", owner });
      setRouteState(new URLSearchParams());
      window.location.hash = `${routeHash(ownerRoute(owner))}/new`;
    },
    finishCreatingRecord(recordId) {
      const current = selection();
      if (current.type !== "create") return;
      setSelection({ type: "record", owner: current.owner, recordId });
      setRouteState(new URLSearchParams());
      const hash = `#${routeHash(ownerRoute(current.owner))}/records/${encodeURIComponent(recordId)}`;
      window.history.replaceState(undefined, "", hash);
    },
    closeRecord() {
      const current = selection();
      if (current.type !== "record" && current.type !== "create") return;
      setSelection(current.owner);
      setRouteState(new URLSearchParams());
      window.location.hash = routeHash(ownerRoute(current.owner));
    },
  };
}

function hashPath(): string {
  return window.location.hash.replace(/^#/, "").split("?", 1)[0];
}

function hashParameters(): URLSearchParams {
  return new URLSearchParams(window.location.hash.split("?", 2)[1] ?? "");
}

function routeHash(route: NavigationRoute): string {
  const prefix = route.source === "recent" ? `/recent/${route.section}` : `/${route.section}`;
  return `${prefix}/${encodeURIComponent(route.id)}`;
}

function ownerRoute(owner: NavigationOwner): NavigationRoute {
  return (
    owner.route ?? {
      source: "workspace",
      section: "workspace",
      id: owner.id,
    }
  );
}

export function NavigationProvider(props: ParentProps<{ controller: NavigationController }>) {
  return <NavigationContext.Provider value={props.controller}>{props.children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationController {
  const navigation = useContext(NavigationContext);
  if (!navigation) throw new Error("NavigationProvider is missing");
  return navigation;
}
