import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchService } from "../../../base/services/fetch-service";
import { DataChangeService } from "../data-changes/data-change-service";
import { defineEntity, entityId } from "../entities/entity-description";
import { EntityRegistry } from "../entities/entity-registry";
import { createEntityPageStore } from "./entity-page-store";
import { entityReference, resolveEntityReference } from "./entity-reference";

const ticket = defineEntity({
  id: entityId("tickets"),
  tableName: "tickets",
  label: "Ticket",
  pluralLabel: "Tickets",
  icon: () => null,
  identityAttribute: "id",
  route: { type: "ticket", attribute: "key" },
  attributes: [
    { id: "id", label: "ID", valueType: "string", generated: true },
    { id: "key", label: "Key", valueType: "string", generated: true },
    { id: "title", label: "Title", valueType: "string", edit: { control: "text" } },
  ],
});
const models = new EntityRegistry([ticket]);
const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});
const response = (ids = ["internal-id"]) => ({
  results: [
    {
      type: "rows",
      result_columns: [
        { attribute: "id", values: { type: "string", values: ids } },
        { attribute: "key", values: { type: "string", values: ids.map(() => "TEST-123") } },
        { attribute: "title", values: { type: "string", values: ids.map(() => "Original") } },
      ],
    },
  ],
});

describe("entity pages", () => {
  it("resolves namespace aliases before querying the canonical entity ID", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const payload =
        String(input) === "/api/entity-key-resolve"
          ? { found: true, entity_type: "tickets", entity_id: "internal-id" }
          : response();
      return { ok: true, json: async () => payload } as Response;
    });
    const store = createRoot((dispose) => {
      disposers.push(dispose);
      return createEntityPageStore(() => ":issues:TEST-123", {
        models,
        fetchService: new FetchService(fetcher),
        dataChanges: new DataChangeService(),
      });
    });
    await vi.waitFor(() => expect(store.page()?.recordId).toBe("internal-id"));
    expect(fetcher).toHaveBeenCalledWith(
      "/api/entity-key-resolve",
      expect.objectContaining({ body: JSON.stringify({ namespace: "issues", key: "TEST-123" }) }),
    );
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/query"),
      expect.objectContaining({ body: expect.stringContaining('"attribute":"id"') }),
    );
  });

  it("loads public keys through an exact bounded query and reconciles in place", async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => response() }) as Response);
    const changes = new DataChangeService();
    const store = createRoot((dispose) => {
      disposers.push(dispose);
      return createEntityPageStore(() => "ticket:TEST-123", {
        models,
        fetchService: new FetchService(fetcher),
        dataChanges: changes,
      });
    });
    await vi.waitFor(() => expect(store.page.loading).toBe(false));
    const page = store.page()!;
    expect(page.recordId).toBe("internal-id");
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/query"),
      expect.objectContaining({ body: expect.stringContaining('"attribute":"key"') }),
    );
    expect(entityReference(ticket, page.result, page.result.rows[0])).toBe("ticket:TEST-123");
    changes.publish({ tableName: "tickets", recordId: "internal-id", changes: { title: "Changed" } });
    expect(page.result.rows[0].value(page.result.requireColumn("title"))).toBe("Changed");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(resolveEntityReference("tickets:internal-id", models).attribute).toBe("id");
  });

  it("handles missing, ambiguous, unknown and malformed entity links", async () => {
    expect(() => resolveEntityReference("unknown:x", models)).toThrow("Unknown entity type");
    expect(() => resolveEntityReference("ticket:", models)).toThrow("type:identifier");
    expect(resolveEntityReference("ticket:a:b", models).key).toBe("a:b");
    for (const ids of [[], ["a", "b"]]) {
      const store = createRoot((dispose) => {
        disposers.push(dispose);
        return createEntityPageStore(() => "ticket:TEST-123", {
          models,
          fetchService: new FetchService(async () => ({ ok: true, json: async () => response(ids) }) as Response),
          dataChanges: new DataChangeService(),
        });
      });
      await vi.waitFor(() => expect(store.page.loading).toBe(false));
      if (ids.length) expect(store.page.error.message).toContain("matches multiple");
      else expect(store.page()?.recordId).toBeUndefined();
    }
  });

  it("does not show a stale response after the entity reference changes", async () => {
    let finish!: () => void;
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = () => resolve({ ok: true, json: async () => response(["old"]) } as Response);
          }),
      )
      .mockResolvedValue({ ok: true, json: async () => response(["new"]) });
    const { store, select } = createRoot((dispose) => {
      disposers.push(dispose);
      const [reference, select] = createSignal("ticket:OLD");
      return {
        select,
        store: createEntityPageStore(reference, {
          models,
          fetchService: new FetchService(fetcher),
          dataChanges: new DataChangeService(),
        }),
      };
    });
    select("ticket:NEW");
    await vi.waitFor(() => expect(store.page()?.recordId).toBe("new"));
    finish();
    await Promise.resolve();
    expect(store.page()?.recordId).toBe("new");
  });
});
