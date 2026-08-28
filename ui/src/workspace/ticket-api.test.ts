import { describe, expect, it, vi } from "vitest";

import { loadTickets } from "./ticket-api";
import { FetchService } from "../services/fetch-service";

describe("loadTickets", () => {
  it("queries and converts columnar ticket data", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        number_of_hits: 1,
        result_columns: [
          { attribute: "id", values: { type: "string", values: ["TICKET-1"] } },
          { attribute: "title", values: { type: "string", values: ["Fix navigation bug"] } },
          { attribute: "description", values: { type: "string", values: ["Selection is lost"] } },
          { attribute: "status", values: { type: "string", values: ["open"] } },
        ],
      }),
    });

    await expect(loadTickets(new FetchService(fetcher))).resolves.toEqual([
      { id: "TICKET-1", title: "Fix navigation bug", description: "Selection is lost", status: "open" },
    ]);
    expect(fetcher).toHaveBeenCalledWith("/api/query", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      table_name: "tickets",
      criterion: "match_any",
      max_results: 100,
      attributes: ["id", "title", "description", "status"],
    });
  });

  it("rejects malformed responses", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result_columns: [] }) });
    await expect(loadTickets(new FetchService(fetcher))).rejects.toThrow("invalid response");
  });
});
