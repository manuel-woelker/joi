import type { FetchService } from "../services/fetch-service";
import { parseQueryResponse, type QueryResult } from "./query-result";

export type QueryCriterionRequest =
  | "match_any"
  | { not: QueryCriterionRequest }
  | { equals: { attribute: string; values: string[] } };

export interface QueryRequest {
  readonly tableName: string;
  readonly criterion: QueryCriterionRequest;
  readonly maxResults: number;
  readonly attributes: readonly string[];
}

export async function executeDataQuery(service: FetchService, request: QueryRequest): Promise<QueryResult> {
  const payload = await service.post("/api/query", {
    table_name: request.tableName,
    criterion: request.criterion,
    max_results: request.maxResults,
    attributes: request.attributes,
  });
  return parseQueryResponse(payload);
}
