import { executeDataQuery, type QueryCriterionRequest } from "../query/query-client";
import type { QueryResult } from "../query/query-result";
import { fetchService, type FetchService } from "../../../base/services/fetch-service";
import type { EntityDescription } from "../entities/entity-description";
import type { QueryDefinition } from "./model";

export function loadEntityRecords(
  entity: EntityDescription,
  service: FetchService = fetchService,
  query?: QueryDefinition,
): Promise<QueryResult> {
  return executeDataQuery(service, {
    tableName: entity.tableName,
    criterion: queryCriterion(query),
    maxResults: 100,
    attributes: ["*"],
  });
}

function queryCriterion(query: QueryDefinition | undefined): QueryCriterionRequest {
  const filter = query?.filter;
  if (!filter || filter.disabled || filter.type !== "criterion") return "match_any";
  if (filter.operator !== "equals" && filter.operator !== "not-equals" && filter.operator !== "in-set") {
    return "match_any";
  }
  const values =
    filter.operand?.type === "set"
      ? filter.operand.values.map(String)
      : filter.operand?.type === "value"
        ? [String(filter.operand.value)]
        : [];
  if (!values.length) return "match_any";
  const equals = { equals: { attribute: filter.attribute, values } } as const;
  return filter.operator === "not-equals" ? { not: equals } : equals;
}
