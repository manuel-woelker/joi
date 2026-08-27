import { describe, expect, it, vi } from "vitest";

import { FetchService } from "./fetch-service";

describe("FetchService", () => {
  it("gets and decodes JSON", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ value: 1 }) });

    await expect(new FetchService(fetcher).get("/api/info")).resolves.toEqual({ value: 1 });
    expect(fetcher).toHaveBeenCalledWith("/api/info", { method: "GET" });
  });

  it("posts JSON requests", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

    await new FetchService(fetcher).post("/api/query", { limit: 10 });
    expect(fetcher).toHaveBeenCalledWith("/api/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 10 }),
    });
  });

  it("rejects unsuccessful responses before decoding", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 503 });

    await expect(new FetchService(fetcher).get("/api/info"))
      .rejects.toThrow("GET /api/info failed with HTTP 503");
  });
});
