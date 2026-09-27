import type { EntityDescription } from "../entities/entity-description";
import type { EntityRegistry } from "../entities/entity-registry";
import type { QueryResult, QueryResultRow } from "../query/query-result";

/** Resolves a type:key link using canonical IDs or server-defined public aliases. */
export function resolveEntityReference(reference: string, models: EntityRegistry) {
  const colon = reference.indexOf(":");
  if (colon <= 0 || colon === reference.length - 1) throw new Error("Entity links must have the form type:identifier.");
  const type = reference.slice(0, colon);
  const key = reference.slice(colon + 1);
  const entity = models.values().find((model) => (model.route?.type ?? model.id) === type || model.id === type);
  if (!entity) throw new Error(`Unknown entity type '${type}'.`);
  return { entity, key, attribute: entity.route?.type === type ? entity.route.attribute : entity.identityAttribute };
}

/** Creates a public link from already-loaded data, falling back to the immutable ID. */
export function entityReference(entity: EntityDescription, result: QueryResult, row: QueryResultRow): string {
  const column = result.column(entity.route?.attribute ?? entity.identityAttribute);
  const value = column && row.value(column);
  if (typeof value === "string" && value) return `${entity.route?.type ?? entity.id}:${value}`;
  const id = row.value(result.requireColumn(entity.identityAttribute));
  if (typeof id !== "string" || !id) throw new Error("Entity has no identifier.");
  return `${entity.id}:${id}`;
}
