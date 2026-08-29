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

export function loadTicket(id: string, service: FetchService = fetchService): Promise<QueryResult> {
  return executeDataQuery(service, {
    tableName: "tickets",
    criterion: { equals: { attribute: "id", values: [id] } },
    maxResults: 1,
    attributes: ["*"],
  });
}

export async function updateTicket(
  id: string,
  values: { title: string; description: string },
  service: FetchService = fetchService,
): Promise<void> {
  await service.post("/api/mutate", {
    steps: [
      {
        update: {
          table_name: "tickets",
          ids: [id],
          columns: [
            { attribute: "title", values: { type: "string", values: [values.title] } },
            { attribute: "description", values: { type: "string", values: [values.description] } },
          ],
        },
      },
    ],
  });
}

function queryCriterion(query: QueryDefinition | undefined): QueryCriterionRequest {
  const filter = query?.filters.length === 1 ? query.filters[0] : undefined;
  if (!filter || filter.operator === "contains") return "match_any";
  const values = Array.isArray(filter.value) ? filter.value : [filter.value];
  const equals = { equals: { attribute: filter.field, values } } as const;
  return filter.operator === "not-equals" ? { not: equals } : equals;
}
