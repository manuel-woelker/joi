import { executeDataQuery, type QueryCriterionRequest } from "../query/query-client";
import type { QueryResult } from "../query/query-result";
import { fetchService, type FetchService } from "../services/fetch-service";
import type { QueryDefinition } from "./model";

export function loadTickets(service: FetchService = fetchService, query?: QueryDefinition): Promise<QueryResult> {
  return executeDataQuery(service, {
    tableName: "tickets",
    criterion: queryCriterion(query),
    maxResults: 100,
    attributes: ["*"],
  });
}

function queryCriterion(query: QueryDefinition | undefined): QueryCriterionRequest {
  const filter = query?.filters.length === 1 ? query.filters[0] : undefined;
  if (!filter || filter.operator === "contains") return "match_any";
  const values = Array.isArray(filter.value) ? filter.value : [filter.value];
  const equals = { equals: { attribute: filter.field, values } } as const;
  return filter.operator === "not-equals" ? { not: equals } : equals;
}
