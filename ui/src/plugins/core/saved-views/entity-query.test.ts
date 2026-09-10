import { describe, expect, it, vi } from "vitest";

import { loadEntityRecords } from "./entity-query";
import { FetchService } from "../../../base/services/fetch-service";
import type { QueryDefinition } from "./model";
import { testEntity } from "./test-fixtures";

describe("loadEntityRecords", () => {
  it("queries and converts columnar entity data", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        number_of_hits: 1,
        result_columns: [
          { attribute: "id", values: { type: "string", values: ["0o5Fs0EELR0fUjHjbCnEtdUwQe3"] } },
          { attribute: "key", values: { type: "string", values: ["TEST-1"] } },
          { attribute: "title", values: { type: "string", values: ["Fix navigation bug"] } },
          { attribute: "description", values: { type: "string", values: ["Selection is lost"] } },
          { attribute: "status", values: { type: "string", values: ["open"] } },
        ],
      }),
    });

    const query: QueryDefinition = {
      id: "query-open",
      name: "Open tickets",
      entityId: testEntity.id,
      filters: [{ field: "status", operator: "in", value: ["open", "in-progress"] }],
      sorting: [],
    };
    const result = await loadEntityRecords(testEntity, new FetchService(fetcher), query);
    expect(result.rows[0].value(result.requireColumn("key"))).toBe("TEST-1");
    expect(fetcher).toHaveBeenCalledWith("/api/query", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      table_name: "things",
      criterion: { equals: { attribute: "status", values: ["open", "in-progress"] } },
      max_results: 100,
      attributes: ["*"],
    });
  });

  it("rejects malformed responses", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result_columns: [] }) });
    await expect(loadEntityRecords(testEntity, new FetchService(fetcher))).rejects.toThrow("invalid number_of_hits");
  });
});
