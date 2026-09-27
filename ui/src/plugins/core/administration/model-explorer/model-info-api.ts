import { modelServiceFor } from "../../entities/model-service";
import type { ModelInfoResponse } from "../../../../generated/api/api";
import { fetchService, type FetchService } from "../../../../base/services/fetch-service";

export function loadModelInfo(service: FetchService = fetchService): Promise<ModelInfoResponse> {
  return modelServiceFor(service).info();
}
