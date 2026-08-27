export type InfoResponse = Record<string, string | number | boolean | null>;

export async function loadInfo(fetcher: typeof fetch = fetch): Promise<InfoResponse> {
  const response = await fetcher("/api/info");
  if (!response.ok) throw new Error(`Info request failed with HTTP ${response.status}`);

  const payload: unknown = await response.json();
  if (!isInfoResponse(payload)) throw new Error("Info action returned an invalid response");
  return payload;
}

function isInfoResponse(value: unknown): value is InfoResponse {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.values(value).every((item) =>
      item === null || ["string", "number", "boolean"].includes(typeof item),
    );
}
