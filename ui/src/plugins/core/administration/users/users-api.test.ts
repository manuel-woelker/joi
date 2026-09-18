import { describe, expect, it, vi } from "vitest";

import { FetchService } from "../../../../base/services/fetch-service";
import { loadUsers } from "./users-api";

describe("loadUsers", () => {
  it("loads users without exposing their internal ids", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            type: "rows",
            result_columns: [
              { attribute: "username", values: { type: "string", values: ["jane.developer", "joe.tester"] } },
              { attribute: "name", values: { type: "string", values: ["Jane Developer", "Joe Tester"] } },
            ],
          },
        ],
      }),
    });

    const result = await loadUsers(new FetchService(fetcher));
    const username = result.requireColumn("username");
    const name = result.requireColumn("name");
    expect(result.rows.map((row) => [row.value(username), row.value(name)])).toEqual([
      ["jane.developer", "Jane Developer"],
      ["joe.tester", "Joe Tester"],
    ]);
    expect(fetcher).toHaveBeenCalledWith("/api/query?i=users%2Frows", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        table_name: "users",
        criterion: "match_any",
        results: [{ type: "rows", sorting: [], max_results: 1000, attributes: ["*"] }],
      }),
    });
  });
});
