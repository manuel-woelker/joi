import type { InitialService, ResolvedServices, ServiceDefinitions, ServiceKey } from "./services";

export interface ExtensionPoint<T> { readonly id: string; readonly description: string; readonly key: symbol }
export interface ExtensionInfo { readonly id: string; readonly description: string }
export interface PluginInfo { readonly name: string; readonly description: string; readonly extensionPoints: readonly string[]; readonly extensions: readonly string[] }
export interface ExtensionPointInfo extends ExtensionInfo { readonly extensions: readonly string[] }
export interface PluginRegistryMetadata { readonly plugins: readonly PluginInfo[]; readonly extensionPoints: readonly ExtensionPointInfo[]; readonly extensions: readonly ExtensionInfo[] }

type AnyServices = Record<string, unknown>;
type ExtensionPoints = Map<symbol, ExtensionPoint<unknown>>;
interface RegisteredExtension<T = unknown> extends ExtensionInfo { readonly value: T }
type RegisteredExtensions = Map<symbol, RegisteredExtension[]>;

export class ExtensionPointContext<S extends AnyServices = AnyServices> {
  constructor(private readonly points: ExtensionPoints, private readonly pointIds: Set<string>, readonly services: S) {}
  registerExtensionPoint<T>({ point }: { point: ExtensionPoint<T> }): void {
    if (this.points.has(point.key) || this.pointIds.has(point.id)) throw new Error(`Extension point '${point.id}' is already registered`);
    this.points.set(point.key, point as ExtensionPoint<unknown>);
    this.pointIds.add(point.id);
  }
}

export class ExtensionContext<S extends AnyServices = AnyServices> {
  constructor(private readonly points: ExtensionPoints, private readonly extensionIds: Set<string>, private readonly extensions: RegisteredExtensions, readonly services: S) {}
  registerExtension<T>({ point, id, description, value }: { point: ExtensionPoint<T>; id: string; description: string; value: T }): void {
    if (!this.points.has(point.key)) throw new Error(`Extension point '${point.id}' is not registered`);
    if (this.extensionIds.has(id)) throw new Error(`Extension '${id}' is already registered`);
    this.extensions.get(point.key)!.push({ id, description, value });
    this.extensionIds.add(id);
  }
}

type PluginDefinition<R extends ServiceDefinitions, P extends ServiceDefinitions> = {
  name: string;
  description: string;
  requires?: R;
  provides?: P;
  registerExtensionPoints?(context: ExtensionPointContext<ResolvedServices<R> & ResolvedServices<P>>): void;
  registerExtensions?(context: ExtensionContext<ResolvedServices<R> & ResolvedServices<P>>): void;
} & (keyof P extends never
  ? { initialize?(services: ResolvedServices<R>): ResolvedServices<P> }
  : { initialize(services: ResolvedServices<R>): ResolvedServices<P> });

export interface UiPlugin {
  readonly name: string;
  readonly description: string;
  readonly requires: ServiceDefinitions;
  readonly provides: ServiceDefinitions;
  initialize(services: AnyServices): AnyServices;
  registerExtensionPoints?(context: ExtensionPointContext): void;
  registerExtensions?(context: ExtensionContext): void;
}

export function plugin<const R extends ServiceDefinitions = {}, const P extends ServiceDefinitions = {}>(definition: PluginDefinition<R, P>): UiPlugin {
  const requires = definition.requires ?? {} as R;
  const provides = definition.provides ?? {} as P;
  return {
    name: definition.name,
    description: definition.description,
    requires,
    provides,
    initialize: (services) => definition.initialize?.(services as ResolvedServices<R>) ?? {},
    registerExtensionPoints: definition.registerExtensionPoints as UiPlugin["registerExtensionPoints"],
    registerExtensions: definition.registerExtensions as UiPlugin["registerExtensions"],
  };
}

export function extensionPoint<T>(id: string, description: string): ExtensionPoint<T> { return { id, description, key: Symbol(id) }; }

export class PluginRegistryBuilder {
  private readonly pluginNames = new Set<string>();
  private readonly plugins: UiPlugin[] = [];
  constructor(private readonly initialServices: readonly InitialService<unknown>[] = []) {}

  register(candidate: UiPlugin): this {
    if (this.pluginNames.has(candidate.name)) throw new Error(`Plugin '${candidate.name}' is already registered`);
    this.pluginNames.add(candidate.name); this.plugins.push(candidate); return this;
  }

  build(): PluginRegistry {
    const { orderedPlugins, serviceValues } = initializeServices(this.plugins, this.initialServices);
    const points: ExtensionPoints = new Map(); const pointIds = new Set<string>(); const pluginInfo: PluginInfo[] = [];
    for (const candidate of orderedPlugins) {
      const stagedPoints = new Map(points); const stagedIds = new Set(pointIds);
      candidate.registerExtensionPoints?.(new ExtensionPointContext(stagedPoints, stagedIds, resolvePluginServices(candidate, serviceValues)));
      const added = [...stagedPoints.values()].filter((point) => !pointIds.has(point.id));
      replaceMap(points, stagedPoints); replaceSet(pointIds, stagedIds);
      pluginInfo.push({ name: candidate.name, description: candidate.description, extensionPoints: added.map((point) => point.id), extensions: [] });
    }
    const extensions: RegisteredExtensions = new Map([...points.keys()].map((key) => [key, []])); const extensionIds = new Set<string>();
    for (const [index, candidate] of orderedPlugins.entries()) {
      const staged = cloneExtensions(extensions); const stagedIds = new Set(extensionIds);
      candidate.registerExtensions?.(new ExtensionContext(points, stagedIds, staged, resolvePluginServices(candidate, serviceValues)));
      const added = [...staged.values()].flat().filter((extension) => !extensionIds.has(extension.id));
      replaceMap(extensions, staged); replaceSet(extensionIds, stagedIds);
      pluginInfo[index] = { ...pluginInfo[index], extensions: added.map((extension) => extension.id) };
    }
    return new PluginRegistry(pluginInfo, points, extensions);
  }
}

function initializeServices(plugins: UiPlugin[], initial: readonly InitialService<unknown>[]) {
  const values = new Map<symbol, unknown>(initial.map(({ key, value }) => [key.token, value]));
  const providers = new Map<symbol, UiPlugin>();
  for (const candidate of plugins) for (const key of Object.values(candidate.provides)) {
    if (values.has(key.token) || providers.has(key.token)) throw new Error(`Service '${key.id}' has multiple providers`);
    providers.set(key.token, candidate);
  }
  const dependencies = new Map(plugins.map((candidate) => [candidate, new Set<UiPlugin>()]));
  for (const candidate of plugins) for (const key of Object.values(candidate.requires)) {
    if (values.has(key.token)) continue;
    const provider = providers.get(key.token); if (!provider) throw new Error(`Plugin '${candidate.name}' requires missing service '${key.id}'`);
    dependencies.get(candidate)!.add(provider);
  }
  const ordered: UiPlugin[] = []; const remaining = new Set(plugins);
  while (remaining.size) {
    const ready = [...remaining].filter((candidate) => [...dependencies.get(candidate)!].every((dependency) => !remaining.has(dependency))).sort((a, b) => a.name.localeCompare(b.name));
    if (!ready.length) throw new Error(`Plugin service dependency cycle: ${[...remaining].map((plugin) => plugin.name).sort().join(" -> ")}`);
    for (const candidate of ready) {
      const required = resolve(candidate.requires, values); const provided = candidate.initialize(required);
      const expected = Object.keys(candidate.provides).sort(); const actual = Object.keys(provided).sort();
      if (expected.join("\0") !== actual.join("\0")) throw new Error(`Plugin '${candidate.name}' did not create exactly its declared services`);
      for (const alias of expected) {
        if (provided[alias] === undefined) throw new Error(`Plugin '${candidate.name}' returned undefined for service '${candidate.provides[alias].id}'`);
        values.set(candidate.provides[alias].token, provided[alias]);
      }
      remaining.delete(candidate); ordered.push(candidate);
    }
  }
  return { orderedPlugins: ordered, serviceValues: values };
}

function resolvePluginServices(plugin: UiPlugin, values: Map<symbol, unknown>): AnyServices { return { ...resolve(plugin.requires, values), ...resolve(plugin.provides, values) }; }
function resolve(definitions: ServiceDefinitions, values: Map<symbol, unknown>): AnyServices { return Object.fromEntries(Object.entries(definitions).map(([alias, key]) => [alias, values.get(key.token)])); }

export class PluginRegistry {
  private readonly extensionsByPoint: ReadonlyMap<symbol, readonly RegisteredExtension[]>; private readonly registryMetadata: PluginRegistryMetadata;
  constructor(plugins: readonly PluginInfo[], points: ExtensionPoints, extensions: RegisteredExtensions) {
    this.extensionsByPoint = new Map([...extensions].map(([key, values]) => [key, Object.freeze([...values])]));
    this.registryMetadata = Object.freeze({
      plugins: Object.freeze(plugins.map((candidate) => Object.freeze({ ...candidate, extensionPoints: Object.freeze([...candidate.extensionPoints]), extensions: Object.freeze([...candidate.extensions]) }))),
      extensionPoints: Object.freeze([...points].map(([key, point]) => Object.freeze({ id: point.id, description: point.description, extensions: Object.freeze((extensions.get(key) ?? []).map((extension) => extension.id)) }))),
      extensions: Object.freeze([...extensions.values()].flat().map(({ id, description }) => Object.freeze({ id, description }))),
    });
  }
  extensions<T>(point: ExtensionPoint<T>): readonly T[] { return (this.extensionsByPoint.get(point.key) ?? []).map((extension) => extension.value as T); }
  metadata(): PluginRegistryMetadata { return this.registryMetadata; }
}

function cloneExtensions(source: RegisteredExtensions): RegisteredExtensions { return new Map([...source].map(([key, values]) => [key, [...values]])); }
function replaceMap<K, V>(target: Map<K, V>, source: Map<K, V>): void { target.clear(); source.forEach((value, key) => target.set(key, value)); }
function replaceSet<T>(target: Set<T>, source: Set<T>): void { target.clear(); source.forEach((value) => target.add(value)); }
