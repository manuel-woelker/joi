import { PluginRegistryBuilder, type UiPlugin } from "./plugins/registry";

interface PluginModule {
  default: UiPlugin;
}

const pluginModules = import.meta.glob<PluginModule>("./**/*.plugin.ts{,x}", { eager: true });

export function createApplicationPluginRegistry() {
  const plugins = Object.entries(pluginModules)
    .map(([path, module]) => validatePlugin(path, module.default))
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));

  const builder = new PluginRegistryBuilder();
  plugins.forEach((candidate) => builder.register(candidate));
  return builder.build();
}

function validatePlugin(path: string, candidate: UiPlugin | undefined): UiPlugin {
  if (!candidate || typeof candidate.register !== "function") {
    throw new Error(`UI plugin module '${path}' must have a default plugin export`);
  }
  return candidate;
}
