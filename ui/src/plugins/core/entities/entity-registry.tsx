import { createContext, useContext, type ParentProps } from "solid-js";

import type { EntityDescription, EntityId } from "./entity-description";

/** Immutable lookup of compiled server entity descriptions. */
export class EntityRegistry {
  readonly #entities: ReadonlyMap<EntityId, EntityDescription>;

  constructor(descriptions: readonly EntityDescription[]) {
    this.#entities = new Map(descriptions.map((description) => [description.id, description]));
    if (this.#entities.size !== descriptions.length) throw new Error("Duplicate entity IDs in application model");
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

export function EntityRegistryProvider(props: ParentProps<{ registry: EntityRegistry }>) {
  return <EntityRegistryContext.Provider value={props.registry}>{props.children}</EntityRegistryContext.Provider>;
}

export function useEntityRegistry(): EntityRegistry {
  const registry = useContext(EntityRegistryContext);
  if (!registry) throw new Error("EntityRegistryProvider is missing");
  return registry;
}
