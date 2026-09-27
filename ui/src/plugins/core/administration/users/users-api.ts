import type { QueryResult } from "../../query/query-result";
import { fetchService, type FetchService } from "../../../../base/services/fetch-service";
import { loadEntityRecords } from "../../saved-views/entity-query";
import { userEntityId } from "./user-entity";
import { modelServiceFor } from "../../entities/model-service";

export async function loadUsers(service: FetchService = fetchService): Promise<QueryResult> {
  const models = modelServiceFor(service);
  await models.load();
  return loadEntityRecords(models.require(userEntityId), service);
}
