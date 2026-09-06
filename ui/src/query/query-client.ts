import { executeQuery } from "../generated/api/command-client";
import type { QueryRequest as GeneratedQueryRequest } from "../generated/api/api";
import type { FetchService } from "../services/fetch-service";
import { parseQueryResponse, type QueryResult } from "./query-result";

export type QueryCriterionRequest =
  | "match_any"
  | { not: QueryCriterionRequest }
  | { equals: { attribute: string; values: string[] } };

export type QueryRequest = Omit<GeneratedQueryRequest, "criterion"> & {
  readonly criterion: QueryCriterionRequest;
};

export async function executeDataQuery(service: FetchService, request: QueryRequest): Promise<QueryResult> {
  const response = await executeQuery(service, {
    tableName: request.tableName,
    criterion: request.criterion,
    maxResults: request.maxResults,
    attributes: request.attributes,
  });
  return parseQueryResponse({
    number_of_hits: response.numberOfHits,
    result_columns: response.resultColumns,
  });
}
