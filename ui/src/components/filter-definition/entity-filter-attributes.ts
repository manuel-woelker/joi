import type { EntityDescription } from "../../plugins/core/entities/entity-description";
import { filterAttributeId } from "./filter-model";
import type { FilterableAttribute } from "./filter-operators";

/** Adapts an entity description to the domain-neutral filter editor contract. */
export function entityFilterAttributes(entity: EntityDescription): readonly FilterableAttribute[] {
  return entity.attributes.map((attribute) => ({
    id: filterAttributeId(attribute.id),
    label: attribute.label,
    valueType: attribute.valueType,
  }));
}
