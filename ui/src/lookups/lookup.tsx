import { createContext, createResource, useContext, type JSX } from "solid-js";

import type { PluginRegistryAccess } from "../plugins/registry";
import { extensionPoint } from "../plugins/registry";

declare const lookupIdBrand: unique symbol;
declare const lookupEntryIdBrand: unique symbol;

/** Identifies one registered lookup definition. */
export type LookupId = string & { readonly [lookupIdBrand]: true };

/** Identifies one value within a lookup definition. */
export type LookupEntryId = string & { readonly [lookupEntryIdBrand]: true };

/** Brands a validated lookup definition identifier. */
export function lookupId(value: string): LookupId {
  if (!value.trim()) throw new Error("Lookup ID must not be empty");
  return value as LookupId;
}

/** Brands an identifier obtained from a lookup's backing data source. */
export function lookupEntryId(value: string): LookupEntryId {
  if (!value) throw new Error("Lookup entry ID must not be empty");
  return value as LookupEntryId;
}

/** One selectable value supplied by a lookup. */
export interface LookupEntry {
  readonly id: LookupEntryId;
  readonly label: string;
}

/** A plugin contribution that resolves stored identifiers to display labels. */
export interface LookupDefinition {
  readonly id: LookupId;
  readonly label: string;
  load(): Promise<readonly LookupEntry[]>;
}

export const lookupDefinitions = extensionPoint<LookupDefinition>(
  "lookup-definitions",
  "Resolves stored identifiers into user-facing labels",
);

/** Querying and cache boundary for plugin-contributed lookups. */
export class LookupService {
  private readonly loads = new Map<LookupId, Promise<readonly LookupEntry[]>>();
  private readonly definitions: ReadonlyMap<LookupId, LookupDefinition>;

  constructor(registry: PluginRegistryAccess) {
    const definitions = registry.extensions(lookupDefinitions);
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]));
    if (this.definitions.size !== definitions.length) throw new Error("Lookup IDs must be unique");
  }

  entries(id: LookupId): Promise<readonly LookupEntry[]> {
    const definition = this.definitions.get(id);
    if (!definition) return Promise.reject(new Error(`Lookup '${id}' is not registered`));
    let load = this.loads.get(id);
    if (!load) {
      load = definition
        .load()
        .then((entries) => Object.freeze([...entries]))
        .catch((error) => {
          this.loads.delete(id);
          throw error;
        });
      this.loads.set(id, load);
    }
    return load;
  }

  async label(id: LookupId, value: LookupEntryId): Promise<string> {
    return (await this.entries(id)).find((entry) => entry.id === value)?.label ?? value;
  }
}

const LookupContext = createContext<LookupService>();

export function LookupProvider(props: { registry: PluginRegistryAccess; children: JSX.Element }) {
  return <LookupContext.Provider value={new LookupService(props.registry)}>{props.children}</LookupContext.Provider>;
}

export function useLookupService(): LookupService {
  const service = useContext(LookupContext);
  if (!service) throw new Error("Lookup service is not available");
  return service;
}

/** Renders a lookup value and updates when its cached source has loaded. */
export function LookupValue(props: { lookup: LookupId; value: string }) {
  const service = useLookupService();
  const [label] = createResource(
    () => [props.lookup, props.value] as const,
    ([lookup, value]) => service.label(lookup, lookupEntryId(value)),
  );
  return <>{label() ?? props.value}</>;
}
