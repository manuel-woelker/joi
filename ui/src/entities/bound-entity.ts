import type { DataTableColumn } from "../components/DataTable";
import type { QueryColumnHandle, QueryResult } from "../query/query-result";
import { requireEntityAttribute, type AnyEntityAttribute, type EntityDescription } from "./entity-description";

/** Presentation override selecting one entity attribute for a table. */
export interface EntityTableField {
  readonly attribute: string;
  readonly label?: string;
  readonly width?: number;
}

/** An entity description resolved against one query result. */
export interface BoundEntity {
  readonly description: EntityDescription;
  readonly result: QueryResult;
  readonly identity: QueryColumnHandle;
  attribute(attributeId: string): BoundEntityAttribute;
}

/** One described entity attribute and its response-local query handle. */
export interface BoundEntityAttribute {
  readonly description: AnyEntityAttribute;
  readonly column: QueryColumnHandle;
}

/** Resolves and validates an entity description against a query result. */
export function bindEntity(result: QueryResult, description: EntityDescription): BoundEntity {
  const attributes = new Map<string, BoundEntityAttribute>();
  for (const attribute of description.attributes) {
    const column = result.column(attribute.id);
    if (!column) {
      throw new Error(`Entity '${description.id}' attribute '${attribute.id}' is missing from the query result`);
    }
    if (column.type !== attribute.valueType) {
      throw new Error(
        `Entity '${description.id}' attribute '${attribute.id}' expects ${attribute.valueType}, received ${column.type}`,
      );
    }
    attributes.set(attribute.id, { description: attribute, column });
  }
  const identity = attributes.get(description.identityAttribute)?.column;
  if (!identity) throw new Error(`Entity '${description.id}' identity attribute is not bound`);
  return {
    description,
    result,
    identity,
    attribute(attributeId) {
      const attribute = attributes.get(attributeId);
      if (!attribute) throw new Error(`Entity '${description.id}' attribute '${attributeId}' is not bound`);
      return attribute;
    },
  };
}

/** Creates table columns from entity defaults or an ordered presentation selection. */
export function createEntityTableColumns(
  entity: BoundEntity,
  fields?: readonly EntityTableField[],
  overrides: Readonly<Record<string, Partial<Omit<DataTableColumn, "column">>>> = {},
): readonly DataTableColumn[] {
  const selected = fields ?? defaultTableFields(entity.description);
  return selected.map((field) => {
    const attribute = requireEntityAttribute(entity.description, field.attribute);
    const column = entity.attribute(attribute.id).column;
    return {
      column,
      header: field.label ?? attribute.label,
      width: field.width ?? attribute.table?.width,
      ...overrides[attribute.id],
    };
  });
}

function defaultTableFields(description: EntityDescription): readonly EntityTableField[] {
  return description.attributes
    .filter((attribute) => attribute.table?.visibleByDefault)
    .map((attribute) => ({ attribute: attribute.id }));
}
