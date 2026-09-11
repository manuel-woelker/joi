import { createContext, useContext, type ParentProps } from "solid-js";

import type { PluginRegistry } from "./plugin-registry";

const PluginRegistryContext = createContext<PluginRegistry>();

/** Makes an immutable plugin registry available to descendant components. */
export function PluginRegistryProvider(props: ParentProps<{ registry: PluginRegistry }>) {
  return <PluginRegistryContext.Provider value={props.registry}>{props.children}</PluginRegistryContext.Provider>;
}

/** Returns the current plugin registry or throws outside its provider. */
export function usePluginRegistry(): PluginRegistry {
  const registry = useContext(PluginRegistryContext);
  if (!registry) throw new Error("PluginRegistryProvider is missing");
  return registry;
}
