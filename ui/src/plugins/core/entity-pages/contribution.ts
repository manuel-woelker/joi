import type { Component } from "solid-js";
import { extensionPoint } from "../../../base/plugin-registry";
import type { EntityDescription, EntityId } from "../entities/entity-description";
import type { QueryResult } from "../query/query-result";

/** Loaded entity data shared by custom standalone displays and the generic editor. */
export interface EntityDisplayProps {
  readonly entity: EntityDescription;
  readonly result: QueryResult;
  readonly recordId: string;
  readonly onClose: () => void;
}

export interface EntityDisplayContribution {
  /** Canonical model ID, e.g. ticketEntityId, not its public URL alias. */
  readonly entityType: EntityId;
  readonly component: Component<EntityDisplayProps>;
}

/** At most one custom main-view display per model. Unregistered models use the shared editor. */
export const entityDisplays = extensionPoint<EntityDisplayContribution>(
  "entity-displays",
  "Displays individual entities in the main view",
  (contributions) => {
    const types = new Set<EntityId>();
    for (const contribution of contributions) {
      if (types.has(contribution.entityType))
        throw new Error(`Duplicate entity display for '${contribution.entityType}'`);
      types.add(contribution.entityType);
    }
  },
);
