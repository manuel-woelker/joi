import { serviceKey } from "../../services";
import type { FetchService } from "../../../services/fetch-service";

export type InfoResponse = Record<string, string | number | boolean | null>;

export class BackendInfoService {
  constructor(private readonly dependencies: { fetchService: FetchService }) {}
  async load(): Promise<InfoResponse> {
    const payload = await this.dependencies.fetchService.get("/api/info");
    if (!isInfoResponse(payload)) throw new Error("Info action returned an invalid response");
    return payload;
  }
}

export const backendInfoServiceKey = serviceKey<BackendInfoService>("backend-info-service");

function isInfoResponse(value: unknown): value is InfoResponse {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => item === null || ["string", "number", "boolean"].includes(typeof item))
  );
}
