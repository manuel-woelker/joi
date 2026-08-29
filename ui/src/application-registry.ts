import { PluginRegistryBuilder, type UiPlugin } from "./plugins/registry";
import { fetchService, fetchServiceKey } from "./services/fetch-service";
import { createPluginRegistryService, pluginRegistryServiceKey } from "./plugins/plugin-registry-service";

interface PluginModule {
  default: UiPlugin;
}

const pluginModules = import.meta.glob<PluginModule>("./**/*.plugin.ts{,x}", { eager: true });

export function createApplicationPluginRegistry() {
  const plugins = Object.entries(pluginModules)
    .map(([path, module]) => validatePlugin(path, module.default))
    .sort((left, right) => left.name.localeCompare(right.name));

  const pluginRegistry = createPluginRegistryService();
  const builder = new PluginRegistryBuilder([
    { key: fetchServiceKey, value: fetchService },
    { key: pluginRegistryServiceKey, value: pluginRegistry.service },
  ]);
  plugins.forEach((candidate) => builder.register(candidate));
  const registry = builder.build();
  pluginRegistry.setRegistry(registry);
  return registry;
}

function validatePlugin(path: string, candidate: UiPlugin | undefined): UiPlugin {
  if (!candidate || typeof candidate.name !== "string" || typeof candidate.description !== "string") {
    throw new Error(`UI plugin module '${path}' must have a default plugin export`);
  }
  return candidate;
}
