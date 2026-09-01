import { PluginRegistryBuilder, type UiPlugin } from "./plugins/registry";
import { fetchService, fetchServiceKey } from "./services/fetch-service";
import { createPluginRegistryService, pluginRegistryServiceKey } from "./plugins/plugin-registry-service";
import { DataChangeService, dataChangeServiceKey } from "./data-changes/data-change-service";
import { RecordMutationService, recordMutationServiceKey } from "./data-changes/record-mutation-service";

interface PluginModule {
  default: UiPlugin;
}

const pluginModules = import.meta.glob<PluginModule>("./**/*.plugin.ts{,x}", { eager: true });

export function createApplication() {
  const plugins = Object.entries(pluginModules)
    .map(([path, module]) => validatePlugin(path, module.default))
    .sort((left, right) => left.name.localeCompare(right.name));

  const pluginRegistry = createPluginRegistryService();
  const dataChanges = new DataChangeService();
  const recordMutations = new RecordMutationService(fetchService, dataChanges);
  const builder = new PluginRegistryBuilder([
    { key: fetchServiceKey, value: fetchService },
    { key: pluginRegistryServiceKey, value: pluginRegistry.service },
    { key: dataChangeServiceKey, value: dataChanges },
    { key: recordMutationServiceKey, value: recordMutations },
  ]);
  plugins.forEach((candidate) => builder.register(candidate));
  const registry = builder.build();
  pluginRegistry.setRegistry(registry);
  return { registry, services: { dataChanges, recordMutations } };
}

export function createApplicationPluginRegistry() {
  return createApplication().registry;
}

function validatePlugin(path: string, candidate: UiPlugin | undefined): UiPlugin {
  if (!candidate || typeof candidate.name !== "string" || typeof candidate.description !== "string") {
    throw new Error(`UI plugin module '${path}' must have a default plugin export`);
  }
  return candidate;
}
