import { describe, expect, it, vi } from "vitest";

import { loadEntityFacet, loadEntityRecordCount, loadEntityRecords } from "./entity-query";
import { FetchService } from "../../../base/services/fetch-service";
import type { QueryDefinition } from "./model";
import { testEntity } from "./test-fixtures";

const query: QueryDefinition = {
  id: "query-open",
  name: "Open tickets",
  entityId: testEntity.id,
  filter: {
    id: "root-filter" as never,
    type: "composite",
    kind: "all",
    children: [
      {
        id: "status-filter" as never,
        type: "criterion",
        attribute: "status" as never,
        operator: "in-set" as never,
        operand: { type: "set", values: ["open", "in-progress"] },
      },
      {
        id: "title-filter" as never,
        type: "criterion",
        attribute: "title" as never,
        operator: "contains" as never,
        operand: { type: "value", value: "navigation" },
      },
    ],
  },
  sorting: [
    { field: "status" as never, direction: "ascending" },
    { field: "title" as never, direction: "descending" },
  ],
};

describe("entity queries", () => {
  it("queries rows without aggregate result shapes", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            type: "rows",
            result_columns: [
              { attribute: "id", values: { type: "string", values: ["0o5Fs0EELR0fUjHjbCnEtdUwQe3"] } },
              { attribute: "key", values: { type: "string", values: ["TEST-1"] } },
              { attribute: "title", values: { type: "string", values: ["Fix navigation bug"] } },
              { attribute: "description", values: { type: "string", values: ["Selection is lost"] } },
              { attribute: "status", values: { type: "string", values: ["open"] } },
            ],
          },
        ],
      }),
    });

    const result = await loadEntityRecords(testEntity, new FetchService(fetcher), query);
    expect(result.rows[0].value(result.requireColumn("key"))).toBe("TEST-1");
    expect(fetcher).toHaveBeenCalledWith("/api/query?i=things%2Frows", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      table_name: "things",
      criterion: {
        all: [
          { equals: { attribute: "status", values: ["open", "in-progress"] } },
          { contains: { attribute: "title", value: "navigation" } },
        ],
      },
      results: [
        {
          type: "rows",
          sorting: [
            { attribute: "status", direction: "ascending" },
            { attribute: "title", direction: "descending" },
          ],
          max_results: 1000,
          attributes: ["*"],
        },
      ],
    });
  });

  it("loads total and facet counts through separate requests", async () => {
    const fetcher = vi.fn(async (_input, init) => {
      const request = JSON.parse(String(init?.body));
      const attribute = request.results[0].attribute;
      return {
        ok: true,
        json: async () => ({
          results: [
            {
              type: "aggregate",
              aggregation: "count",
              attribute: attribute ?? null,
              values: attribute ? [{ value: "open", count: 7 }] : [{ value: null, count: 12 }],
            },
          ],
        }),
      } as Response;
    });
    const service = new FetchService(fetcher);

    const [total, facet] = await Promise.all([
      loadEntityRecordCount(testEntity, service, query),
      loadEntityFacet(testEntity, "status", service, query),
    ]);

    expect(total).toBe(12);
    expect(facet.values).toEqual([{ value: "open", count: 7 }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      "/api/query?i=things%2Fcount-total",
      "/api/query?i=things%2Ffacet-status",
    ]);
    const requests = fetcher.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(requests[0].criterion).toEqual({
      all: [
        { equals: { attribute: "status", values: ["open", "in-progress"] } },
        { contains: { attribute: "title", value: "navigation" } },
      ],
    });
    expect(requests[1].criterion).toEqual({ contains: { attribute: "title", value: "navigation" } });
    expect(requests.every((request) => request.results.length === 1)).toBe(true);
  });

  it("rejects malformed responses", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    await expect(loadEntityRecords(testEntity, new FetchService(fetcher))).rejects.toThrow("does not start");
  });
});
