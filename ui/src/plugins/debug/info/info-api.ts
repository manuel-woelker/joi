import { fetchService, type FetchService } from "../../../services/fetch-service";

export type InfoResponse = Record<string, string | number | boolean | null>;

export async function loadInfo(service: FetchService = fetchService): Promise<InfoResponse> {
  const payload = await service.get("/api/info");
  if (!isInfoResponse(payload)) throw new Error("Info action returned an invalid response");
  return payload;
}

function isInfoResponse(value: unknown): value is InfoResponse {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.values(value).every((item) =>
      item === null || ["string", "number", "boolean"].includes(typeof item),
    );
}
