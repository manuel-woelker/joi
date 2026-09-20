import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchService } from "../../../base/services/fetch-service";
import { DataChangeService } from "../data-changes/data-change-service";
import { parseQueryResponse } from "../query/query-result";
import type { MasterDetailDefinition } from "./definition";
import { createRecordCreationStore, createRecordEditorStore } from "./record-editor-store";

const definition: MasterDetailDefinition = {
  tableName: "tests",
  identityAttribute: "id",
  detailTitle: "Test",
  fields: [
    { attribute: "name", label: "Name", control: "text" },
    { attribute: "rank", label: "Rank", control: "integer" },
  ],
  create: {
    title: "New test",
    attributes: [
      { attribute: "id", valueType: "string", initialValue: () => "created" },
      { attribute: "name", valueType: "string", initialValue: () => "" },
      { attribute: "rank", valueType: "int", initialValue: () => 0 },
    ],
    fields: [
      { attribute: "name", label: "Name", control: "text" },
      { attribute: "rank", label: "Rank", control: "integer" },
    ],
  },
};
const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});
function result() {
  return parseQueryResponse({
    number_of_hits: 1,
    result_columns: [
      { attribute: "id", values: { type: "string", values: ["a"] } },
      { attribute: "name", values: { type: "string", values: ["Original"] } },
      { attribute: "rank", values: { type: "int", values: [1] } },
    ],
  });
}

describe("record editor stores", () => {
  it("converts partial changes, propagates failures to Form, and reports successful saves", async () => {
    const update = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const store = createRoot((dispose) => {
      disposers.push(dispose);
      return createRecordEditorStore(
        { definition, result, recordId: () => "a" },
        {
          fetchService: new FetchService(),
          dataChanges: new DataChangeService(),
          recordMutations: { update },
        },
      );
    });
    await expect(store.save({ rank: "2" })).rejects.toThrow("offline");
    expect(store.saved()).toBe(false);
    await store.save({ rank: "2" });
    expect(update).toHaveBeenLastCalledWith(definition, "a", { rank: 2 });
    expect(store.saved()).toBe(true);
    await expect(store.save({ rank: "fraction" })).rejects.toThrow("Rank must be an integer");
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("binds external changes to Form reconciliation and releases the subscription", () => {
    const dataChanges = new DataChangeService();
    const reconcile = vi.fn();
    const current = result();
    let disposeForm!: () => void;
    createRoot((dispose) => {
      disposers.push(dispose);
      const store = createRecordEditorStore(
        { definition, result: () => current, recordId: () => "a" },
        {
          fetchService: new FetchService(),
          dataChanges,
          recordMutations: { update: vi.fn() },
        },
      );
      createRoot((dispose) => {
        disposeForm = dispose;
        store.attachForm({ reconcile });
      });
    });
    dataChanges.publish({ tableName: "tests", recordId: "a", changes: { name: "External", rank: 2 } });
    expect(reconcile).toHaveBeenCalledWith({ name: "External", rank: "2" });
    expect(current.rows[0].value(current.requireColumn("name"))).toBe("External");
    disposeForm();
    dataChanges.publish({ tableName: "tests", recordId: "a", changes: { name: "Ignored" } });
    expect(reconcile).toHaveBeenCalledOnce();
  });

  it("does not mark another selection as saved when an older save completes", async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((done) => {
      resolve = done;
    });
    const { store, select } = createRoot((dispose) => {
      disposers.push(dispose);
      const [id, select] = createSignal("a");
      const current = result();
      return {
        select,
        store: createRecordEditorStore(
          { definition, result: () => current, recordId: id },
          {
            fetchService: new FetchService(),
            dataChanges: new DataChangeService(),
            recordMutations: { update: () => pending },
          },
        ),
      };
    });
    const saving = store.save({ name: "Changed" });
    select("b");
    resolve();
    await saving;
    expect(store.saved()).toBe(false);
  });

  it("retains create defaults across retries and skips navigation after disposal", async () => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((yes, no) => {
          resolve = () => yes({ ok: true, json: async () => ({}) } as Response);
          reject = no;
        }),
    );
    const onCreated = vi.fn();
    const { store, dispose } = createRoot((dispose) => {
      disposers.push(dispose);
      return {
        dispose,
        store: createRecordCreationStore(definition, { fetchService: new FetchService(fetcher) }, onCreated)!,
      };
    });
    const first = store.submit({ name: "New", rank: "4" });
    reject(new Error("offline"));
    await expect(first).rejects.toThrow("offline");
    expect(onCreated).not.toHaveBeenCalled();
    const second = store.submit({ name: "New", rank: "4" });
    resolve();
    await second;
    expect(onCreated).toHaveBeenCalledWith("created");
    const third = store.submit({ name: "New", rank: "4" });
    dispose();
    resolve();
    await third;
    expect(onCreated).toHaveBeenCalledOnce();
  });
});
