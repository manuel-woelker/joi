import { createContext, useContext, type ParentProps } from "solid-js";
import type { EntityHistoryService } from "./entity-history-service";

const Context = createContext<EntityHistoryService>();

/** Makes the plugin-provided history service available to generic record details. */
export function EntityHistoryProvider(props: ParentProps<{ service: EntityHistoryService }>) {
  return <Context.Provider value={props.service}>{props.children}</Context.Provider>;
}

/** History remains optional in standalone editors and alternate application compositions. */
export function useOptionalEntityHistoryService() {
  return useContext(Context);
}
