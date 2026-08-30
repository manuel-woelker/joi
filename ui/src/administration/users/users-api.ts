import { executeDataQuery } from "../../query/query-client";
import type { QueryResult } from "../../query/query-result";
import { fetchService, type FetchService } from "../../services/fetch-service";
import { userEntity } from "../../entities/user-entity";

export function loadUsers(service: FetchService = fetchService): Promise<QueryResult> {
  return executeDataQuery(service, {
    tableName: userEntity.tableName,
    criterion: "match_any",
    maxResults: 100,
    attributes: ["*"],
  });
}
