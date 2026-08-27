import { describe, expect, it, vi } from "vitest";

import { loadInfo } from "./info-api";
import { FetchService } from "../../../services/fetch-service";

describe("loadInfo", () => {
  it("loads scalar application information", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ application_name: "joix-tickets", version: "0.1.0" }),
    });

    await expect(loadInfo(new FetchService(fetcher))).resolves.toEqual({
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

    await expect(loadInfo(new FetchService(fetcher))).rejects.toThrow("invalid response");
  });
});
