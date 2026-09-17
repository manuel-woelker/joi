import { describe, expect, it, vi } from "vitest";

import { loadEntityRecords, loadEntityRecordsWithFacets } from "./entity-query";
import { FetchService } from "../../../base/services/fetch-service";
import type { QueryDefinition } from "./model";
import { testEntity } from "./test-fixtures";

describe("loadEntityRecords", () => {
  it("queries and converts columnar entity data", async () => {
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
          { type: "aggregate", aggregation: "count", attribute: null, values: [{ value: null, count: 1 }] },
          { type: "aggregate", aggregation: "count", attribute: "status", values: [{ value: "open", count: 1 }] },
        ],
      }),
    });

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
    const result = await loadEntityRecordsWithFacets(testEntity, new FetchService(fetcher), query);
    expect(result.rows[0].value(result.requireColumn("key"))).toBe("TEST-1");
    expect(fetcher).toHaveBeenCalledWith("/api/query", expect.objectContaining({ method: "POST" }));
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
          max_results: 100,
          attributes: ["*"],
        },
        { type: "aggregate", aggregation: "count", max_results: 100 },
        {
          type: "aggregate",
          aggregation: "count",
          max_results: 100,
          attribute: "status",
          criterion: { contains: { attribute: "title", value: "navigation" } },
        },
      ],
    });
  });

  it("does not request aggregates when only entity rows are loaded", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ type: "rows", result_columns: [] }] }),
    });

    await loadEntityRecords(testEntity, new FetchService(fetcher));

    expect(JSON.parse(fetcher.mock.calls[0][1].body).results).toEqual([
      { type: "rows", sorting: [], max_results: 100, attributes: ["*"] },
    ]);
  });

  it("rejects malformed responses", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    await expect(loadEntityRecords(testEntity, new FetchService(fetcher))).rejects.toThrow("does not start");
  });
});
