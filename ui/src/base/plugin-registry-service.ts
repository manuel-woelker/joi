import { serviceKey } from "./service-registry";
import type { ExtensionPoint, PluginRegistry, PluginRegistryAccess } from "./plugin-registry";

export type PluginRegistryService = PluginRegistryAccess;

export interface PluginRegistryServiceController {
  readonly service: PluginRegistryService;
  setRegistry(registry: PluginRegistry): void;
}

export const pluginRegistryServiceKey = serviceKey<PluginRegistryService>("plugin-registry-service");

export function createPluginRegistryService(): PluginRegistryServiceController {
  let registry: PluginRegistry | undefined;
  const requireRegistry = () => {
    if (!registry) throw new Error("Plugin registry is not initialized");
    return registry;
  };

  return {
    service: {
      extensions<T>(point: ExtensionPoint<T>) {
        return requireRegistry().extensions(point);
      },
      metadata() {
        return requireRegistry().metadata();
      },
    },
    setRegistry(value) {
      if (registry) throw new Error("Plugin registry is already initialized");
      registry = value;
    },
  };
}
