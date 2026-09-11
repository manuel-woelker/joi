import { DataChangeService, dataChangeServiceKey } from "../plugins/core/data-changes/data-change-service";
import { RecordMutationService, recordMutationServiceKey } from "../plugins/core/data-changes/record-mutation-service";
import { createPluginRegistryService, pluginRegistryServiceKey } from "./plugin-registry-service";
import { PluginRegistryBuilder, type UiPlugin } from "./plugin-registry";
import { fetchService, fetchServiceKey } from "./services/fetch-service";

interface PluginModule {
  default: UiPlugin;
}

const pluginModules = import.meta.glob<PluginModule>("../plugins/**/*.plugin.ts{,x}", { eager: true });

/** Returns all statically discovered UI plugins in deterministic name order. */
export function discoveredApplicationPlugins(): readonly UiPlugin[] {
  return Object.entries(pluginModules)
    .map(([path, module]) => validatePlugin(path, module.default))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Builds the application registry and its shared runtime services.
 *
 * Passing plugins explicitly bypasses discovery, which is useful for tests and
 * alternate application compositions.
 */
export function createApplication(options: { plugins?: readonly UiPlugin[] } = {}) {
  const initializationStarted = performance.now();
  const plugins = options.plugins ?? discoveredApplicationPlugins();

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
  console.info(`UI plugin system initialized in ${(performance.now() - initializationStarted).toFixed(2)} ms`);
  return { registry, services: { dataChanges, recordMutations } };
}

/** Builds and returns the registry for the statically discovered application. */
export function createApplicationPluginRegistry() {
  return createApplication().registry;
}

function validatePlugin(path: string, candidate: UiPlugin | undefined): UiPlugin {
  if (!candidate || typeof candidate.name !== "string" || typeof candidate.description !== "string") {
    throw new Error(`UI plugin module '${path}' must have a default plugin export`);
  }
  return candidate;
}
