import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EntityHistoryRequest, EntityHistoryResponse, HistoryEntry } from "../../../generated/api/api";
import { DataChangeService } from "../data-changes/data-change-service";
import { createEntityHistoryStore } from "./entity-history-store";

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});
async function settle() {
  for (let i = 0; i < 15; i++) await Promise.resolve();
}
function entry(id: string): HistoryEntry {
  return { id, entityId: "a", userid: "system", timestamp: "2026-09-26T12:00:00Z", type: "Create", changes: [] };
}
function page(id: string, nextCursor: string | null = null): EntityHistoryResponse {
  return { enabled: true, entries: [entry(id)], nextCursor };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup(load: (request: EntityHistoryRequest) => Promise<EntityHistoryResponse> = async () => page("1")) {
  const service = { enabled: vi.fn(async () => true), load: vi.fn(load) };
  const dataChanges = new DataChangeService();
  return createRoot((dispose) => {
    disposers.push(dispose);
    const [id, setId] = createSignal("a");
    const store = createEntityHistoryStore({ table: () => "tickets", recordId: id }, { service, dataChanges });
    return { store, service, dataChanges, setId, dispose };
  });
}

describe("entity history store", () => {
  it("loads lazily, pages once, and refreshes only for committed matching changes", async () => {
    const { store, service, dataChanges } = setup(async (request) => (request.cursor ? page("2") : page("1", "next")));
    await settle();
    expect(service.load).not.toHaveBeenCalled();
    store.selectTab("history");
    await settle();
    expect(store.entries().map((entry) => entry.id)).toEqual(["1"]);
    store.loadMore();
    store.loadMore();
    await settle();
    expect(service.load).toHaveBeenCalledTimes(2);
    expect(store.entries().map((entry) => entry.id)).toEqual(["1", "2"]);
    dataChanges.publish({ tableName: "projects", recordId: "a", changes: {} });
    dataChanges.publish({ tableName: "tickets", recordId: "other", changes: {} });
    expect(service.load).toHaveBeenCalledTimes(2);
    dataChanges.publish({ tableName: "tickets", recordId: "a", changes: {} });
    await settle();
    expect(store.entries().map((entry) => entry.id)).toEqual(["1"]);
    store.selectTab("details");
    dataChanges.publish({ tableName: "tickets", recordId: "a", changes: {} });
    expect(service.load).toHaveBeenCalledTimes(3);
    store.selectTab("history");
    await settle();
    expect(service.load).toHaveBeenCalledTimes(4);
  });

  it("ignores previous selection responses and releases subscriptions on disposal", async () => {
    const first = deferred<EntityHistoryResponse>();
    const { store, service, setId, dataChanges, dispose } = setup(async (request) =>
      request.entityId === "a" ? first.promise : page("new"),
    );
    await settle();
    store.selectTab("history");
    setId("b");
    await settle();
    expect(store.entries()[0].id).toBe("new");
    first.resolve(page("old"));
    await settle();
    expect(store.entries()[0].id).toBe("new");
    dispose();
    const count = service.load.mock.calls.length;
    dataChanges.publish({ tableName: "tickets", recordId: "b", changes: {} });
    expect(service.load).toHaveBeenCalledTimes(count);
  });

  it("keeps existing pages on failure and retries the first page", async () => {
    const { store, service } = setup(async () => {
      throw new Error("Unavailable");
    });
    await settle();
    store.selectTab("history");
    await settle();
    expect(store.error()).toBe("Unavailable");
    expect(store.loading()).toBe(false);
    service.load.mockResolvedValue(page("recovered"));
    store.retry();
    await settle();
    expect(store.error()).toBeUndefined();
    expect(store.entries()[0].id).toBe("recovered");
  });

  it("can retry capability failures and never loads history for unsupported models", async () => {
    const { store, service, setId } = setup();
    await settle();
    service.enabled.mockRejectedValueOnce(new Error("Metadata unavailable"));
    setId("b");
    await settle();
    expect(store.error()).toBe("Metadata unavailable");
    service.enabled.mockResolvedValue(false);
    store.retry();
    await settle();
    store.selectTab("history");
    expect(store.enabled()).toBe(false);
    expect(store.tab()).toBe("details");
    expect(service.load).not.toHaveBeenCalled();
  });
});
