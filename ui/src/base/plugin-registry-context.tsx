import { createContext, useContext, type ParentProps } from "solid-js";

import type { PluginRegistry } from "./plugin-registry";

const PluginRegistryContext = createContext<PluginRegistry>();

export function PluginRegistryProvider(props: ParentProps<{ registry: PluginRegistry }>) {
  return <PluginRegistryContext.Provider value={props.registry}>{props.children}</PluginRegistryContext.Provider>;
}

export function usePluginRegistry(): PluginRegistry {
  const registry = useContext(PluginRegistryContext);
  if (!registry) throw new Error("PluginRegistryProvider is missing");
  return registry;
}
