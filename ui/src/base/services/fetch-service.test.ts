import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchService } from "./fetch-service";

afterEach(() => vi.useRealTimers());

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

    await expect(new FetchService(fetcher).get("/api/info")).rejects.toThrow("GET /api/info failed with HTTP 503");
  });

  it("notifies listeners when the session is unauthorized", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const unauthorized = vi.fn();
    const service = new FetchService(fetcher);
    const unsubscribe = service.onUnauthorized(unauthorized);

    await expect(service.get("/api/info")).rejects.toThrow("HTTP 401");
    expect(unauthorized).toHaveBeenCalledOnce();

    unsubscribe();
    await expect(service.get("/api/info")).rejects.toThrow("HTTP 401");
    expect(unauthorized).toHaveBeenCalledOnce();
  });

  it("applies a configurable artificial delay before requests", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ value: 1 }) });
    const service = new FetchService(fetcher);
    service.setArtificialDelayMs(1000);

    const request = service.get("/api/info");
    expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(999);
    expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await request;

    expect(fetcher).toHaveBeenCalledOnce();
  });
});
