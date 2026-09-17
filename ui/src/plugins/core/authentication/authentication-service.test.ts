import { describe, expect, it, vi } from "vitest";

import { FetchService, type Fetcher } from "../../../base/services/fetch-service";
import { loadCurrentUser, loadLoginUsers } from "./authentication-service";

const user = { id: "user-1", username: "jane", name: "Jane Developer" };

describe("authentication service", () => {
  it("loads the current user through the generated user-info client", async () => {
    const fetcher = vi.fn<Fetcher>(async () => ({ ok: true, json: async () => user }) as Response);

    await expect(loadCurrentUser(new FetchService(fetcher))).resolves.toEqual(user);
    expect(fetcher).toHaveBeenCalledWith("/api/user-info", { method: "GET" });
  });

  it("loads login users through the generated query client", async () => {
    const fetcher = vi.fn<Fetcher>(
      async () =>
        ({
          ok: true,
          json: async () => ({
            results: [
              {
                type: "rows",
                result_columns: [
                  { attribute: "id", values: { type: "string", values: [user.id] } },
                  { attribute: "username", values: { type: "string", values: [user.username] } },
                  { attribute: "name", values: { type: "string", values: [user.name] } },
                ],
              },
            ],
          }),
        }) as Response,
    );

    await expect(loadLoginUsers(new FetchService(fetcher))).resolves.toEqual([user]);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      table_name: "users",
      criterion: "match_any",
      results: [{ type: "rows", sorting: [], max_results: 100, attributes: ["id", "username", "name"] }],
    });
  });
});
