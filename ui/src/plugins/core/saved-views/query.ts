import type { EntityDescription } from "../entities/entity-description";
import { requireEntityAttribute } from "../entities/entity-description";
import type { QueryResult, QueryResultRow } from "../query/query-result";
import type { PresentationDefinition, QueryDefinition } from "./model";
import type { FilterDefinition } from "../../../components/filter-definition/filter-model";
import { entityFilterAttributes } from "../../../components/filter-definition/entity-filter-attributes";
import { validateFilterDefinition } from "../../../components/filter-definition/filter-operations";
import { validateFilterAgainstSchema } from "../../../components/filter-definition/filter-operators";

export function executeQuery(result: QueryResult, query: QueryDefinition, text = ""): QueryResultRow[] {
  const needle = text.trim().toLocaleLowerCase();
  const sorting = query.sorting.map((sort) => ({ sort, column: result.requireColumn(sort.field) }));
  const filtered = result.rows.filter(
    (row) =>
      !needle ||
      result.columns.some((column) =>
        String(row.value(column) ?? "")
          .toLocaleLowerCase()
          .includes(needle),
      ),
  );

  return filtered
    .map((row) => ({ row, index: row.index }))
    .sort((left, right) => {
      for (const { sort, column } of sorting) {
        const comparison = String(left.row.value(column) ?? "").localeCompare(String(right.row.value(column) ?? ""));
        if (comparison !== 0) return sort.direction === "ascending" ? comparison : -comparison;
      }
      return left.index - right.index;
    })
    .map(({ row }) => row);
}

export function validatePresentation(
  query: QueryDefinition,
  presentation: PresentationDefinition,
  entity: EntityDescription,
): string | undefined {
  if (query.entityId !== presentation.entityId) return "The query and presentation use different entities.";
  if (query.entityId !== entity.id) return `Entity '${query.entityId}' is not available for this view.`;
  if (presentation.fields.length === 0) return "The presentation must include at least one field.";
  try {
    if (query.filter) {
      validateFilterAttributes(query.filter, entity);
      const filterError = [
        ...validateFilterDefinition(query.filter),
        ...validateFilterAgainstSchema(query.filter, entityFilterAttributes(entity)),
      ][0];
      if (filterError) return filterError;
    }
    for (const sort of query.sorting) requireEntityAttribute(entity, sort.field);
    for (const field of presentation.fields) requireEntityAttribute(entity, field.field);
  } catch (error) {
    return error instanceof Error ? error.message : "View configuration references an unknown attribute.";
  }
  return undefined;
}

function validateFilterAttributes(filter: FilterDefinition, entity: EntityDescription): void {
  if (filter.type === "criterion") requireEntityAttribute(entity, filter.attribute);
  else for (const child of filter.children) validateFilterAttributes(child, entity);
}
