export interface ExtensionPoint<T> {
  readonly id: string;
  readonly description: string;
  readonly key: symbol;
}

export interface ExtensionInfo {
  readonly id: string;
  readonly description: string;
}

export interface PluginInfo {
  readonly name: string;
  readonly description: string;
  readonly extensionPoints: readonly string[];
  readonly extensions: readonly string[];
}

export interface ExtensionPointInfo extends ExtensionInfo {
  readonly extensions: readonly string[];
}

export interface PluginRegistryMetadata {
  readonly plugins: readonly PluginInfo[];
  readonly extensionPoints: readonly ExtensionPointInfo[];
  readonly extensions: readonly ExtensionInfo[];
}

export interface UiPlugin {
  readonly name: string;
  readonly description: string;
  register(context: PluginContext): void;
}

export function extensionPoint<T>(id: string, description: string): ExtensionPoint<T> {
  return { id, description, key: Symbol(id) };
}

export function plugin(
  name: string,
  description: string,
  register: (context: PluginContext) => void,
): UiPlugin {
  return { name, description, register };
}

interface RegisteredExtension<T = unknown> extends ExtensionInfo {
  readonly value: T;
}

export class PluginContext {
  constructor(
    private readonly points: Map<symbol, ExtensionPoint<unknown>>,
    private readonly pointIds: Set<string>,
    private readonly extensionIds: Set<string>,
    private readonly extensions: Map<symbol, RegisteredExtension[]>,
  ) {}

  registerExtensionPoint<T>(point: ExtensionPoint<T>): void {
    if (this.points.has(point.key) || this.pointIds.has(point.id)) {
      throw new Error(`Extension point '${point.id}' is already registered`);
    }
    this.points.set(point.key, point as ExtensionPoint<unknown>);
    this.pointIds.add(point.id);
    this.extensions.set(point.key, []);
  }

  registerExtension<T>(
    point: ExtensionPoint<T>,
    id: string,
    description: string,
    value: T,
  ): void {
    const target = this.extensions.get(point.key);
    if (!target) throw new Error(`Extension point '${point.id}' is not registered`);
    if (this.extensionIds.has(id)) throw new Error(`Extension '${id}' is already registered`);
    target.push({ id, description, value });
    this.extensionIds.add(id);
  }
}

export class PluginRegistryBuilder {
  private readonly pluginNames = new Set<string>();
  private readonly pointIds = new Set<string>();
  private readonly extensionIds = new Set<string>();
  private readonly points = new Map<symbol, ExtensionPoint<unknown>>();
  private readonly extensions = new Map<symbol, RegisteredExtension[]>();
  private readonly plugins: PluginInfo[] = [];

  register(candidate: UiPlugin): this {
    if (this.pluginNames.has(candidate.name)) {
      throw new Error(`Plugin '${candidate.name}' is already registered`);
    }

    const points = new Map(this.points);
    const pointIds = new Set(this.pointIds);
    const extensionIds = new Set(this.extensionIds);
    const extensions = new Map(
      [...this.extensions].map(([key, values]) => [key, [...values]]),
    );
    candidate.register(new PluginContext(points, pointIds, extensionIds, extensions));

    const addedPoints = [...points.values()].filter((point) => !this.pointIds.has(point.id));
    const addedExtensions = [...extensions.values()]
      .flat()
      .filter((extension) => !this.extensionIds.has(extension.id));

    this.pluginNames.add(candidate.name);
    replaceMap(this.points, points);
    replaceSet(this.pointIds, pointIds);
    replaceSet(this.extensionIds, extensionIds);
    replaceMap(this.extensions, extensions);
    this.plugins.push({
      name: candidate.name,
      description: candidate.description,
      extensionPoints: addedPoints.map((point) => point.id),
      extensions: addedExtensions.map((extension) => extension.id),
    });
    return this;
  }

  build(): PluginRegistry {
    return new PluginRegistry(this.plugins, this.points, this.extensions);
  }
}

export class PluginRegistry {
  private readonly extensionsByPoint: ReadonlyMap<symbol, readonly RegisteredExtension[]>;
  private readonly registryMetadata: PluginRegistryMetadata;

  constructor(
    plugins: readonly PluginInfo[],
    points: Map<symbol, ExtensionPoint<unknown>>,
    extensions: Map<symbol, RegisteredExtension[]>,
  ) {
    this.extensionsByPoint = new Map(
      [...extensions].map(([key, values]) => [key, Object.freeze([...values])]),
    );
    this.registryMetadata = Object.freeze({
      plugins: Object.freeze(plugins.map((plugin) => Object.freeze({
        ...plugin,
        extensionPoints: Object.freeze([...plugin.extensionPoints]),
        extensions: Object.freeze([...plugin.extensions]),
      }))),
      extensionPoints: Object.freeze([...points].map(([key, point]) => Object.freeze({
        id: point.id,
        description: point.description,
        extensions: Object.freeze((extensions.get(key) ?? []).map((extension) => extension.id)),
      }))),
      extensions: Object.freeze([...extensions.values()].flat().map((extension) => Object.freeze({
        id: extension.id,
        description: extension.description,
      }))),
    });
  }

  extensions<T>(point: ExtensionPoint<T>): readonly T[] {
    return (this.extensionsByPoint.get(point.key) ?? []).map(
      (extension) => extension.value as T,
    );
  }

  metadata(): PluginRegistryMetadata {
    return this.registryMetadata;
  }
}

function replaceMap<K, V>(target: Map<K, V>, source: Map<K, V>): void {
  target.clear();
  source.forEach((value, key) => target.set(key, value));
}

function replaceSet<T>(target: Set<T>, source: Set<T>): void {
  target.clear();
  source.forEach((value) => target.add(value));
}
