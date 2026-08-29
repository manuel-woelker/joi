import { executeDataQuery } from "../../query/query-client";
import type { QueryResult } from "../../query/query-result";
import { fetchService, type FetchService } from "../../services/fetch-service";

export function loadUsers(service: FetchService = fetchService): Promise<QueryResult> {
  return executeDataQuery(service, {
    tableName: "users",
    criterion: "match_any",
    maxResults: 100,
    attributes: ["*"],
  });
}
