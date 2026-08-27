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
  registerExtensionPoints?(context: ExtensionPointContext): void;
  registerExtensions?(context: ExtensionContext): void;
}

export interface UiPluginDefinition extends UiPlugin {}

export function extensionPoint<T>(id: string, description: string): ExtensionPoint<T> {
  return { id, description, key: Symbol(id) };
}

export function plugin(definition: UiPluginDefinition): UiPlugin {
  return definition;
}

interface RegisteredExtension<T = unknown> extends ExtensionInfo {
  readonly value: T;
}

type ExtensionPoints = Map<symbol, ExtensionPoint<unknown>>;
type RegisteredExtensions = Map<symbol, RegisteredExtension[]>;

export class ExtensionPointContext {
  constructor(
    private readonly points: ExtensionPoints,
    private readonly pointIds: Set<string>,
  ) {}

  registerExtensionPoint<T>(registration: { point: ExtensionPoint<T> }): void {
    const { point } = registration;
    if (this.points.has(point.key) || this.pointIds.has(point.id)) {
      throw new Error(`Extension point '${point.id}' is already registered`);
    }
    this.points.set(point.key, point as ExtensionPoint<unknown>);
    this.pointIds.add(point.id);
  }
}

export class ExtensionContext {
  constructor(
    private readonly points: ExtensionPoints,
    private readonly extensionIds: Set<string>,
    private readonly extensions: RegisteredExtensions,
  ) {}

  registerExtension<T>(registration: {
    point: ExtensionPoint<T>;
    id: string;
    description: string;
    value: T;
  }): void {
    const { point, id, description, value } = registration;
    if (!this.points.has(point.key)) {
      throw new Error(`Extension point '${point.id}' is not registered`);
    }
    if (this.extensionIds.has(id)) throw new Error(`Extension '${id}' is already registered`);

    this.extensions.get(point.key)!.push({ id, description, value });
    this.extensionIds.add(id);
  }
}

export class PluginRegistryBuilder {
  private readonly pluginNames = new Set<string>();
  private readonly plugins: UiPlugin[] = [];

  register(candidate: UiPlugin): this {
    if (this.pluginNames.has(candidate.name)) {
      throw new Error(`Plugin '${candidate.name}' is already registered`);
    }
    this.pluginNames.add(candidate.name);
    this.plugins.push(candidate);
    return this;
  }

  build(): PluginRegistry {
    const points: ExtensionPoints = new Map();
    const pointIds = new Set<string>();
    const pluginInfo: PluginInfo[] = [];

    for (const candidate of this.plugins) {
      const stagedPoints = new Map(points);
      const stagedPointIds = new Set(pointIds);
      candidate.registerExtensionPoints?.(new ExtensionPointContext(stagedPoints, stagedPointIds));
      const addedPoints = [...stagedPoints.values()].filter((point) => !pointIds.has(point.id));
      replaceMap(points, stagedPoints);
      replaceSet(pointIds, stagedPointIds);
      pluginInfo.push({
        name: candidate.name,
        description: candidate.description,
        extensionPoints: addedPoints.map((point) => point.id),
        extensions: [],
      });
    }

    const extensions: RegisteredExtensions = new Map([...points.keys()].map((key) => [key, []]));
    const extensionIds = new Set<string>();
    for (const [index, candidate] of this.plugins.entries()) {
      const stagedExtensions = cloneExtensions(extensions);
      const stagedExtensionIds = new Set(extensionIds);
      candidate.registerExtensions?.(
        new ExtensionContext(points, stagedExtensionIds, stagedExtensions),
      );
      const addedExtensions = [...stagedExtensions.values()]
        .flat()
        .filter((extension) => !extensionIds.has(extension.id));
      replaceMap(extensions, stagedExtensions);
      replaceSet(extensionIds, stagedExtensionIds);
      pluginInfo[index] = {
        ...pluginInfo[index],
        extensions: addedExtensions.map((extension) => extension.id),
      };
    }

    return new PluginRegistry(pluginInfo, points, extensions);
  }
}

export class PluginRegistry {
  private readonly extensionsByPoint: ReadonlyMap<symbol, readonly RegisteredExtension[]>;
  private readonly registryMetadata: PluginRegistryMetadata;

  constructor(
    plugins: readonly PluginInfo[],
    points: ExtensionPoints,
    extensions: RegisteredExtensions,
  ) {
    this.extensionsByPoint = new Map(
      [...extensions].map(([key, values]) => [key, Object.freeze([...values])]),
    );
    this.registryMetadata = Object.freeze({
      plugins: Object.freeze(plugins.map((candidate) => Object.freeze({
        ...candidate,
        extensionPoints: Object.freeze([...candidate.extensionPoints]),
        extensions: Object.freeze([...candidate.extensions]),
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

function cloneExtensions(source: RegisteredExtensions): RegisteredExtensions {
  return new Map([...source].map(([key, values]) => [key, [...values]]));
}

function replaceMap<K, V>(target: Map<K, V>, source: Map<K, V>): void {
  target.clear();
  source.forEach((value, key) => target.set(key, value));
}

function replaceSet<T>(target: Set<T>, source: Set<T>): void {
  target.clear();
  source.forEach((value) => target.add(value));
}
