import { createContext, useContext, type ParentProps } from "solid-js";

import type { PluginRegistryAccess } from "../../../base/plugin-registry";
import { extensionPoint } from "../../../base/plugin-registry";
import type { EntityDescription, EntityId } from "./entity-description";

export const entityDescriptions = extensionPoint<EntityDescription>(
  "entity-descriptions",
  "Defines entities available to generic UI infrastructure",
  (descriptions) => {
    const ids = new Set<EntityId>();
    for (const description of descriptions) {
      if (ids.has(description.id)) throw new Error(`Entity '${description.id}' is registered more than once`);
      ids.add(description.id);
    }
  },
);

/** Immutable lookup of plugin-contributed entity descriptions. */
export class EntityRegistry {
  readonly #entities: ReadonlyMap<EntityId, EntityDescription>;

  constructor(descriptions: readonly EntityDescription[]) {
    this.#entities = new Map(descriptions.map((description) => [description.id, description]));
  }

  get(id: EntityId): EntityDescription | undefined {
    return this.#entities.get(id);
  }

  require(id: EntityId): EntityDescription {
    const description = this.get(id);
    if (!description) throw new Error(`Entity '${id}' is not registered`);
    return description;
  }

  values(): readonly EntityDescription[] {
    return [...this.#entities.values()];
  }
}

const EntityRegistryContext = createContext<EntityRegistry>();

export function EntityRegistryProvider(props: ParentProps<{ pluginRegistry: PluginRegistryAccess }>) {
  const registry = new EntityRegistry(props.pluginRegistry.extensions(entityDescriptions));
  return <EntityRegistryContext.Provider value={registry}>{props.children}</EntityRegistryContext.Provider>;
}

export function useEntityRegistry(): EntityRegistry {
  const registry = useContext(EntityRegistryContext);
  if (!registry) throw new Error("EntityRegistryProvider is missing");
  return registry;
}
