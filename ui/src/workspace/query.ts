import type { FilterDefinition, PresentationDefinition, QueryDefinition, Ticket } from "./model";

function matchesFilter(ticket: Ticket, filter: FilterDefinition): boolean {
  const actual = String(ticket[filter.field]).toLocaleLowerCase();
  const values = (Array.isArray(filter.value) ? filter.value : [filter.value]).map((value) => value.toLocaleLowerCase());

  switch (filter.operator) {
    case "equals": return actual === values[0];
    case "not-equals": return actual !== values[0];
    case "in": return values.includes(actual);
    case "contains": return actual.includes(values[0] ?? "");
  }
}

export function executeQuery(records: Ticket[], query: QueryDefinition, text = ""): Ticket[] {
  const needle = text.trim().toLocaleLowerCase();
  const filtered = records.filter((ticket) =>
    query.filters.every((filter) => matchesFilter(ticket, filter)) &&
    (!needle || ticket.id.toLocaleLowerCase().includes(needle) || ticket.title.toLocaleLowerCase().includes(needle)),
  );

  return filtered.map((ticket, index) => ({ ticket, index })).sort((left, right) => {
    for (const sort of query.sorting) {
      const comparison = String(left.ticket[sort.field]).localeCompare(String(right.ticket[sort.field]));
      if (comparison !== 0) return sort.direction === "ascending" ? comparison : -comparison;
    }
    return left.index - right.index;
  }).map(({ ticket }) => ticket);
}

export function validatePresentation(query: QueryDefinition, presentation: PresentationDefinition): string | undefined {
  if (query.source !== presentation.source) return "The query and presentation use different data sources.";
  if (presentation.fields.length === 0) return "The presentation must include at least one field.";
  return undefined;
}
