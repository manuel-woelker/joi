import { describe, expect, it, vi } from "vitest";

import { FetchService } from "../services/fetch-service";
import type { MasterDetailDefinition } from "./definition";
import { updateRecord } from "./record-api";

describe("record API", () => {
  it("sends string and integer fields in one typed update", async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);
    const service = new FetchService(fetcher);
    const definition: MasterDetailDefinition = {
      tableName: "things",
      identityAttribute: "id",
      detailTitle: "Thing",
      fields: [],
    };
    const name = { attribute: "name", label: "Name", control: "text" } as const;
    const rank = { attribute: "rank", label: "Rank", control: "integer" } as const;

    await updateRecord(service, definition, "thing-1", [
      { field: name, value: "Example" },
      { field: rank, value: 4 },
    ]);

    expect(fetcher).toHaveBeenCalledWith("/api/mutate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        steps: [
          {
            update: {
              table_name: "things",
              ids: ["thing-1"],
              columns: [
                { attribute: "name", values: { type: "string", values: ["Example"] } },
                { attribute: "rank", values: { type: "int", values: [4] } },
              ],
            },
          },
        ],
      }),
    });
  });
});
