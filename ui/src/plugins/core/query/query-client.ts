import { CommandService } from "../../../generated/api/command-service";
import type { QueryRequest as GeneratedQueryRequest } from "../../../generated/api/api";
import type { FetchService } from "../../../base/services/fetch-service";
import {
  parseQueryResponse,
  type QueryAggregateResult,
  type QueryAggregateValue,
  type QueryResult,
} from "./query-result";

export type QueryCriterionRequest =
  | "match_any"
  | { all: readonly QueryCriterionRequest[] }
  | { one: readonly QueryCriterionRequest[] }
  | { none: readonly QueryCriterionRequest[] }
  | { not: QueryCriterionRequest }
  | { equals: { attribute: string; values: readonly string[] } }
  | { less_than: { attribute: string; value: string } }
  | { set: { attribute: string } }
  | { unset: { attribute: string } }
  | { in_range: { attribute: string; minimum?: string; maximum?: string } }
  | { contains: { attribute: string; value: string } };

export interface QueryRowsRequest {
  readonly maxResults: number;
  readonly sorting: readonly {
    readonly attribute: string;
    readonly direction: "ascending" | "descending";
  }[];
  readonly attributes: readonly string[];
}

export interface QueryCountRequest {
  readonly attribute?: string;
  readonly criterion?: QueryCriterionRequest;
}

export type QueryRequest = Omit<GeneratedQueryRequest, "criterion" | "results"> &
  QueryRowsRequest & {
    readonly criterion: QueryCriterionRequest;
    readonly count?: readonly QueryCountRequest[];
    readonly aggregateMaxResults?: number;
  };

export async function executeDataQuery(service: FetchService, request: QueryRequest): Promise<QueryResult> {
  const response = await new CommandService(service).query({
    tableName: request.tableName,
    criterion: request.criterion,
    results: [
      {
        type: "rows",
        sorting: request.sorting,
        max_results: request.maxResults,
        attributes: request.attributes,
      },
      ...(request.count ?? []).map((count) => ({
        type: "aggregate",
        aggregation: "count",
        max_results: request.aggregateMaxResults ?? 100,
        ...(count.attribute === undefined ? {} : { attribute: count.attribute }),
        ...(count.criterion === undefined ? {} : { criterion: count.criterion }),
      })),
    ],
  });
  return parseQueryResults(response.results);
}

function parseQueryResults(value: readonly unknown[]): QueryResult {
  const [rows, ...additional] = value;
  if (!rows || typeof rows !== "object" || (rows as { type?: unknown }).type !== "rows") {
    throw new Error("Query response does not start with a row result");
  }
  const resultColumns = (rows as { result_columns?: unknown }).result_columns;
  const aggregates = additional.map(parseAggregateResult);
  return parseQueryResponse({ number_of_hits: null, result_columns: resultColumns }, aggregates);
}

function parseAggregateResult(value: unknown): QueryAggregateResult {
  if (!value || typeof value !== "object") throw new Error("Query response contains an invalid aggregate result");
  const result = value as {
    type?: unknown;
    aggregation?: unknown;
    attribute?: unknown;
    values?: unknown;
  };
  if (result.type !== "aggregate" || result.aggregation !== "count") {
    throw new Error("Query response contains an unsupported aggregate result");
  }
  if (result.attribute !== undefined && result.attribute !== null && typeof result.attribute !== "string") {
    throw new Error("Query aggregate contains an invalid attribute");
  }
  if (!Array.isArray(result.values)) throw new Error("Query aggregate contains invalid values");
  const values = result.values.map((entry): QueryAggregateValue => {
    if (!entry || typeof entry !== "object") throw new Error("Query aggregate contains an invalid value");
    const candidate = entry as { value?: unknown; count?: unknown };
    if (candidate.value !== null && typeof candidate.value !== "string" && !Number.isSafeInteger(candidate.value)) {
      throw new Error("Query aggregate contains an invalid grouped value");
    }
    if (!Number.isSafeInteger(candidate.count) || (candidate.count as number) < 0) {
      throw new Error("Query aggregate contains an invalid count");
    }
    return { value: candidate.value as string | number | null, count: candidate.count as number };
  });
  return {
    aggregation: "count",
    attribute: typeof result.attribute === "string" ? result.attribute : undefined,
    values,
  };
}
