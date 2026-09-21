import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchService } from "../../../base/services/fetch-service";
import { DataChangeService } from "../data-changes/data-change-service";
import { RecordMutationService } from "../data-changes/record-mutation-service";
import { entityId, type EntityDescription } from "../entities/entity-description";
import { createMasterDetailStore } from "./master-detail-store";

const description: EntityDescription = {
  id: entityId("test"),
  tableName: "tests",
  label: "Test",
  pluralLabel: "Tests",
  icon: () => undefined,
  identityAttribute: "id",
  attributes: [
    { id: "id", label: "ID", valueType: "string" },
    { id: "name", label: "Name", valueType: "string", facet: true, edit: { control: "text" } },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function rows(ids: string[]) {
  return {
    results: [
      {
        type: "rows",
        result_columns: [
          { attribute: "id", values: { type: "string", values: ids } },
          { attribute: "name", values: { type: "string", values: ids.map((id) => `Name ${id}`) } },
        ],
      },
    ],
  };
}
function count(attribute?: string) {
  return {
    results: [
      {
        type: "aggregate",
        aggregation: "count",
        attribute,
        values: [{ value: attribute ? "Name a" : null, count: 2 }],
      },
    ],
  };
}
type Request = { criterion: unknown; results: [{ type: string; attribute?: string; sorting?: unknown }] };
const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  vi.useRealTimers();
});
async function settle() {
  for (let i = 0; i < 25; i++) await Promise.resolve();
}

function setup(
  load: (request: Request) => Promise<unknown> = async (request) =>
    request.results[0].type === "rows" ? rows(["a", "b"]) : count(request.results[0].attribute),
) {
  const requests: Request[] = [];
  const fetchService = new FetchService(async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as Request;
    requests.push(request);
    const response = await load(request);
    return { ok: true, json: async () => response } as Response;
  });
  const dataChanges = new DataChangeService();
  const unregister = vi.fn();
  const invalidateSource = vi.fn();
  const closeRecord = vi.fn();
  const finishCreatingRecord = vi.fn();
  const registerTarget = vi.fn(() => unregister);
  return createRoot((dispose) => {
    disposers.push(dispose);
    const [selectedRecordId, selectRecord] = createSignal<string>();
    const [creatingRecord, setCreating] = createSignal(false);
    const [identity, setIdentity] = createSignal("one");
    const store = createMasterDetailStore(
      { description, filterIdentity: identity },
      {
        fetchService,
        dataChanges,
        recordMutations: new RecordMutationService(fetchService, dataChanges),
        navigation: {
          selectedRecordId,
          selectRecord,
          creatingRecord,
          closeRecord: () => {
            closeRecord();
            selectRecord(undefined);
            setCreating(false);
          },
          createRecord: () => setCreating(true),
          finishCreatingRecord,
        },
        actions: {
          registerTarget,
          availableActions: () => [],
          pendingAction: () => undefined,
          execute: async () => {},
        },
        lookups: { invalidateSource },
      },
    );
    return {
      store,
      requests,
      dataChanges,
      selectRecord,
      setIdentity,
      dispose,
      unregister,
      invalidateSource,
      closeRecord,
      finishCreatingRecord,
    };
  });
}

describe("master-detail store", () => {
  it("runs reactive queries without a DOM, debounces search, and sorts immediately", async () => {
    vi.useFakeTimers();
    const { store, requests } = setup();
    await settle();
    expect(requests).toHaveLength(3);
    expect(store.table().rows).toHaveLength(2);
    store.setSearch(" alpha ");
    await vi.advanceTimersByTimeAsync(299);
    expect(requests).toHaveLength(3);
    store.setSorting([{ attribute: "name", direction: "descending" }]);
    await settle();
    expect(requests).toHaveLength(4);
    expect(requests[3].criterion).toBe("match_any");
    await vi.advanceTimersByTimeAsync(1);
    expect(requests).toHaveLength(7);
    expect(requests[4].criterion).toEqual({ term: { value: "alpha" } });
    const snapshot = store.table();
    expect(snapshot.rows?.[0].value(snapshot.entity.identity)).toBe("a");
  });

  it("loads rows before counts, delays subsequent loading, and refreshes each shape once", async () => {
    vi.useFakeTimers();
    const pending = deferred<unknown>();
    let holdRows = false;
    const { store, requests } = setup(async (request) =>
      request.results[0].type === "rows"
        ? holdRows
          ? pending.promise
          : rows(["a"])
        : count(request.results[0].attribute),
    );
    await settle();
    holdRows = true;
    store.refresh();
    await settle();
    expect(requests).toHaveLength(6);
    expect(store.loading()).toBe(false);
    await vi.advanceTimersByTimeAsync(199);
    expect(store.loading()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(store.loading()).toBe(true);
    pending.resolve(rows(["b"]));
    await settle();
    expect(store.loading()).toBe(false);
    expect(store.table().rows?.[0].value(store.table().entity.identity)).toBe("b");
  });

  it("excludes the selected facet from its own aggregate query and manages panels", async () => {
    const { store, requests } = setup();
    await settle();
    store.changeFacet("name", "string:Name a", "included");
    await settle();
    expect(requests).toHaveLength(6);
    expect(requests[3].criterion).toEqual({ equals: { attribute: "name", values: ["Name a"] } });
    expect(requests[5].criterion).toBe("match_any");
    store.togglePanel("filter");
    store.togglePanel("facets");
    expect(store.activePanel()).toBe("facets");
    store.removeFacet("name");
    expect(store.visibleFacets()).toEqual([]);
    expect((await store.loadFacetEntries("nam")).entries).toEqual([{ id: "name", label: "Name" }]);
    store.addFacet("name");
    store.addFacet("name");
    expect(store.visibleFacets()).toHaveLength(1);
  });

  it("sets facet values directly from cell values and keeps them visible", async () => {
    const { store, requests } = setup();
    await settle();
    store.removeFacet("name");
    expect(store.visibleFacets()).toEqual([]);

    const group = store.cellFacetMenu("name", "Name a");
    expect(group?.label).toBe("Table actions");
    expect(group?.entries.map((entry) => entry.label)).toEqual(['Include "Name a"', 'Exclude "Name a"']);
    expect(store.visibleFacets()).toHaveLength(1);

    group?.entries[0].execute();
    await settle();
    expect(requests.at(-3)?.criterion).toEqual({ equals: { attribute: "name", values: ["Name a"] } });

    // Re-setting the same value replaces the selection instead of duplicating it.
    store.setFacetValue("name", "Name a", "excluded");
    await settle();
    expect(requests.at(-3)?.criterion).toEqual({ not: { equals: { attribute: "name", values: ["Name a"] } } });

    expect(store.cellFacetMenu("id", "a")).toBeUndefined();
  });

  it("ignores stale responses and clears missing selection only after current rows settle", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    let calls = 0;
    const { store, selectRecord, closeRecord } = setup(async (request) =>
      request.results[0].type === "rows"
        ? ++calls === 1
          ? first.promise
          : second.promise
        : count(request.results[0].attribute),
    );
    selectRecord("b");
    store.setSorting([{ attribute: "id", direction: "ascending" }]);
    await settle();
    first.resolve(rows(["a"]));
    await settle();
    expect(closeRecord).not.toHaveBeenCalled();
    second.resolve(rows(["b"]));
    await settle();
    expect(store.table().rows?.[0].value(store.table().entity.identity)).toBe("b");
    selectRecord("missing");
    expect(closeRecord).toHaveBeenCalledOnce();
  });

  it("resets inputs on view changes and cancels pending debounce on disposal", async () => {
    vi.useFakeTimers();
    const { store, requests, setIdentity, dispose, unregister } = setup();
    await settle();
    store.setSearch("obsolete");
    store.setColumnSearch("name", "obsolete");
    setIdentity("two");
    await settle();
    expect(store.search()).toBe("");
    expect(store.columnSearch()).toEqual({});
    const numberOfRequests = requests.length;
    await vi.advanceTimersByTimeAsync(300);
    expect(requests).toHaveLength(numberOfRequests);
    store.setSearch("disposed");
    dispose();
    await vi.advanceTimersByTimeAsync(300);
    expect(requests).toHaveLength(numberOfRequests);
    expect(unregister).toHaveBeenCalledOnce();
  });

  it("applies external mutations in place and unsubscribes on disposal", async () => {
    const { store, requests, dataChanges, dispose, invalidateSource } = setup();
    await settle();
    const result = store.records()!;
    const row = result.rows[0];
    dataChanges.publish({ tableName: "tests", recordId: "a", changes: { name: "Updated" } });
    expect(store.records()).toBe(result);
    expect(row.value(result.requireColumn("name"))).toBe("Updated");
    expect(requests).toHaveLength(3);
    dispose();
    dataChanges.publish({ tableName: "tests", recordId: "a", changes: { name: "Ignored" } });
    expect(invalidateSource).toHaveBeenCalledOnce();
    expect(row.value(result.requireColumn("name"))).toBe("Updated");
  });

  it("exposes errors without throwing from rendering accessors and recovers on refresh", async () => {
    let fail = true;
    const { store } = setup(async (request) => {
      if (fail) throw new Error("offline");
      return request.results[0].type === "rows" ? rows(["a"]) : count(request.results[0].attribute);
    });
    await settle();
    expect(store.rowError()?.message).toBe("offline");
    expect(store.countError()?.message).toBe("offline");
    expect(store.facetErrors()).toHaveLength(1);
    expect(store.table().result.rows).toHaveLength(0);
    fail = false;
    store.refresh();
    await settle();
    expect(store.rowError()).toBeUndefined();
    expect(store.table().rows).toHaveLength(1);
  });

  it("selects created results but does not navigate after disposal", async () => {
    const { store, finishCreatingRecord, closeRecord, dispose } = setup();
    await settle();
    await store.completeCreation("a");
    expect(finishCreatingRecord).toHaveBeenCalledWith("a");
    await store.completeCreation("filtered-out");
    expect(closeRecord).toHaveBeenCalledOnce();
    const completion = store.completeCreation("a");
    dispose();
    await completion;
    expect(finishCreatingRecord).toHaveBeenCalledOnce();
  });
});
