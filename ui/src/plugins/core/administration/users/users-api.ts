import type { QueryResult } from "../../query/query-result";
import { fetchService, type FetchService } from "../../../../base/services/fetch-service";
import { loadEntityRecords } from "../../saved-views/entity-query";
import { userEntity } from "./user-entity";

export function loadUsers(service: FetchService = fetchService): Promise<QueryResult> {
  return loadEntityRecords(userEntity, service);
}
