import { createContext, useContext, type ParentProps } from "solid-js";

export type NavigationOwner = { type: "view" | "administration"; id: string };

export type NavigationSelection =
  | { type: "view" | "administration"; id: string }
  | { type: "record"; owner: NavigationOwner; recordId: string }
  | { type: "create"; owner: NavigationOwner };

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

export function NavigationProvider(props: ParentProps<{ controller: NavigationController }>) {
  return <NavigationContext.Provider value={props.controller}>{props.children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationController {
  const navigation = useContext(NavigationContext);
  if (!navigation) throw new Error("NavigationProvider is missing");
  return navigation;
}
