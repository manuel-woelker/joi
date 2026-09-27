import type { EntityDescription } from "./entity-description";
import type { QueryResult, QueryResultRow, QueryValue } from "../query/query-result";

/** Formats a plain-text label without evaluating expressions or interpreting HTML.
 * Missing values become empty strings; an empty label falls back to the identity, then the entity kind.
 */
export function entityLabel(
  description: EntityDescription,
  value: (attribute: string) => QueryValue | null | undefined,
): string {
  const label = description.labelParts
    .map((part) => (part.type === "literal" ? part.text : String(value(part.attribute) ?? "")))
    .join("")
    .trim();
  return label || String(value(description.identityAttribute) ?? "") || description.label;
}

/** Uses handles from the row's own result and tracks reactive cell updates. */
export function entityRowLabel(description: EntityDescription, result: QueryResult, row: QueryResultRow): string {
  return entityLabel(description, (attribute) => {
    const column = result.column(attribute);
    return column ? row.value(column) : undefined;
  });
}
