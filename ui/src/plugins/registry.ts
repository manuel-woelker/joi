export interface ExtensionPoint<T> {
  readonly id: string;
  readonly description: string;
  readonly key: symbol;
}

export interface ExtensionInfo {
  readonly id: string;
  readonly description: string;
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

    this.pluginNames.add(candidate.name);
    replaceMap(this.points, points);
    replaceSet(this.pointIds, pointIds);
    replaceSet(this.extensionIds, extensionIds);
    replaceMap(this.extensions, extensions);
    return this;
  }

  build(): PluginRegistry {
    return new PluginRegistry(this.extensions);
  }
}

export class PluginRegistry {
  private readonly extensionsByPoint: ReadonlyMap<symbol, readonly RegisteredExtension[]>;

  constructor(extensions: Map<symbol, RegisteredExtension[]>) {
    this.extensionsByPoint = new Map(
      [...extensions].map(([key, values]) => [key, Object.freeze([...values])]),
    );
  }

  extensions<T>(point: ExtensionPoint<T>): readonly T[] {
    return (this.extensionsByPoint.get(point.key) ?? []).map(
      (extension) => extension.value as T,
    );
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
