import { serviceKey } from "./service-registry";
import type { ExtensionPoint, PluginRegistry, PluginRegistryAccess } from "./plugin-registry";

/** Read-only plugin registry operations exposed as an injectable service. */
export type PluginRegistryService = PluginRegistryAccess;

/**
 * Controls the deferred registry service used while the registry itself is built.
 * The registry can be assigned exactly once.
 */
export interface PluginRegistryServiceController {
  readonly service: PluginRegistryService;
  setRegistry(registry: PluginRegistry): void;
}

/** Service key for read-only access to the completed plugin registry. */
export const pluginRegistryServiceKey = serviceKey<PluginRegistryService>("plugin-registry-service");

/**
 * Creates a stable proxy whose target can be assigned after plugin construction.
 * Calls made before assignment fail instead of observing a partial registry.
 */
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
