import type { QueryColumnHandle, QueryResult, QueryResultRow } from "../query/query-result";
import { requireEntityAttribute } from "../entities/entity-description";
import { ticketEntity } from "../entities/ticket-entity";
import type { FilterDefinition, PresentationDefinition, QueryDefinition } from "./model";

function matchesFilter(row: QueryResultRow, column: QueryColumnHandle, filter: FilterDefinition): boolean {
  const actual = String(row.value(column) ?? "").toLocaleLowerCase();
  const values = (Array.isArray(filter.value) ? filter.value : [filter.value]).map((value) =>
    value.toLocaleLowerCase(),
  );

  switch (filter.operator) {
    case "equals":
      return actual === values[0];
    case "not-equals":
      return actual !== values[0];
    case "in":
      return values.includes(actual);
    case "contains":
      return actual.includes(values[0] ?? "");
  }
}

export function executeQuery(result: QueryResult, query: QueryDefinition, text = ""): QueryResultRow[] {
  const needle = text.trim().toLocaleLowerCase();
  const filters = query.filters.map((filter) => ({ filter, column: result.requireColumn(filter.field) }));
  const sorting = query.sorting.map((sort) => ({ sort, column: result.requireColumn(sort.field) }));
  const filtered = result.rows.filter(
    (row) =>
      filters.every(({ filter, column }) => matchesFilter(row, column, filter)) &&
      (!needle ||
        result.columns.some((column) =>
          String(row.value(column) ?? "")
            .toLocaleLowerCase()
            .includes(needle),
        )),
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

export function validatePresentation(query: QueryDefinition, presentation: PresentationDefinition): string | undefined {
  if (query.source !== presentation.source) return "The query and presentation use different data sources.";
  if (presentation.fields.length === 0) return "The presentation must include at least one field.";
  try {
    for (const filter of query.filters) requireEntityAttribute(ticketEntity, filter.field);
    for (const sort of query.sorting) requireEntityAttribute(ticketEntity, sort.field);
    for (const field of presentation.fields) requireEntityAttribute(ticketEntity, field.field);
  } catch (error) {
    return error instanceof Error ? error.message : "View configuration references an unknown attribute.";
  }
  return undefined;
}
