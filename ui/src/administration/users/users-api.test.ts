import { describe, expect, it, vi } from "vitest";

import { FetchService } from "../../services/fetch-service";
import { loadUsers } from "./users-api";

describe("loadUsers", () => {
  it("loads users without exposing their internal ids", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        number_of_hits: 2,
        result_columns: [
          { attribute: "username", values: { type: "string", values: ["jane.developer", "joe.tester"] } },
          { attribute: "name", values: { type: "string", values: ["Jane Developer", "Joe Tester"] } },
        ],
      }),
    });

    await expect(loadUsers(new FetchService(fetcher))).resolves.toEqual([
      { username: "jane.developer", name: "Jane Developer" },
      { username: "joe.tester", name: "Joe Tester" },
    ]);
    expect(fetcher).toHaveBeenCalledWith("/api/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        table_name: "users",
        criterion: "match_any",
        max_results: 100,
        attributes: ["username", "name"],
      }),
    });
  });
});
