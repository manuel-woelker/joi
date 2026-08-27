import { describe, expect, it, vi } from "vitest";

import { BackendInfoService } from "./info-api";
import { FetchService } from "../../../services/fetch-service";

describe("BackendInfoService", () => {
  it("loads scalar application information", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ application_name: "joix-tickets", version: "0.1.0" }),
    });

    const service = new BackendInfoService({ fetchService: new FetchService(fetcher) });
    await expect(service.load()).resolves.toEqual({
      application_name: "joix-tickets",
      version: "0.1.0",
    });
    expect(fetcher).toHaveBeenCalledWith("/api/info", { method: "GET" });
  });

  it("rejects nested values", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ nested: { value: true } }),
    });

    const service = new BackendInfoService({ fetchService: new FetchService(fetcher) });
    await expect(service.load()).rejects.toThrow("invalid response");
  });
});
