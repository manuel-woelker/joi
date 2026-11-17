import { describe, expect, it, vi } from "vitest";

import { FetchService } from "../../../../base/services/fetch-service";
import { loadModelInfo } from "./model-info-api";

describe("loadModelInfo", () => {
  it("loads model metadata through the generated command service", async () => {
    const response = {
      models: [{ name: "tickets", domain: "tickets", attributes: [], history: false, presentation: null }],
      domain_models: [],
      domain_enums: [],
    };
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => response });

    await expect(loadModelInfo(new FetchService(fetcher))).resolves.toEqual({
      models: response.models,
      domainModels: [],
      domainEnums: [],
    });
    expect(fetcher).toHaveBeenCalledWith("/api/model-info", { method: "GET" });
  });
});
