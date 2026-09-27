import { describe, expect, it } from "vitest";
import { FetchService } from "../../../base/services/fetch-service";
import { EntityHistoryService } from "./entity-history-service";

describe("EntityHistoryService", () => {
  it("shares model capability loading and preserves omitted and null wire values", async () => {
    const paths: string[] = [];
    const service = new EntityHistoryService(
      new FetchService(async (input) => {
        const path = String(input);
        paths.push(path);
        const data = path.endsWith("model-info")
          ? {
              models: [
                { name: "tickets", history: true, attributes: [], presentation: null },
                { name: "users", history: false, attributes: [], presentation: null },
              ],
            }
          : {
              enabled: true,
              next_cursor: null,
              entries: [
                {
                  id: "h",
                  entity_id: "t",
                  userid: "system",
                  timestamp: "2026-09-26T00:00:00Z",
                  type: "Update",
                  changes: [{ key: "assignee", new_value: null }],
                },
              ],
            };
        return { ok: true, json: async () => data } as Response;
      }),
    );
    expect(await Promise.all([service.enabled("tickets"), service.enabled("users")])).toEqual([true, false]);
    expect(paths).toHaveLength(1);
    const response = await service.load({ table: "tickets", entityId: "t", limit: 50, cursor: null });
    expect(response.entries[0].changes[0].oldValue).toBeUndefined();
    expect(response.entries[0].changes[0].newValue).toBeNull();
    expect(response.entries[0].userid).toBe("system");
  });
});
