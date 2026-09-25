import { describe, expect, it, vi } from "vitest";

import { FetchService } from "../../../base/services/fetch-service";
import { DataChangeService } from "./data-change-service";
import { RecordMutationService } from "./record-mutation-service";

const definition = {
  tableName: "tickets",
  identityAttribute: "id",
  detailTitle: "Ticket",
  fields: [{ attribute: "title", label: "Title", control: "text" as const }],
};

describe("RecordMutationService", () => {
  it("serializes writes and publishes them after persistence", async () => {
    const resolvers: Array<() => void> = [];
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) =>
          resolvers.push(() => resolve({ ok: true, json: async () => ({}) } as Response)),
        ),
    );
    const changes = new DataChangeService();
    const published: string[] = [];
    changes.subscribe({ tableName: "tickets" }, (change) => published.push(String(change.changes.title)));
    const mutations = new RecordMutationService(new FetchService(fetcher), changes);

    const first = mutations.update(definition, "ticket-1", { title: "First" });
    const second = mutations.update(definition, "ticket-1", { title: "Second" });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(published).toEqual([]);
    resolvers.shift()!();
    await first;
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    resolvers.shift()!();
    await second;
    expect(published).toEqual(["First", "Second"]);
  });

  it("does not publish failed writes", async () => {
    const changes = new DataChangeService();
    const listener = vi.fn();
    changes.subscribe({ tableName: "tickets" }, listener);
    const mutations = new RecordMutationService(
      new FetchService(async () => ({ ok: false, status: 500 }) as Response),
      changes,
    );

    await expect(mutations.update(definition, "ticket-1", { title: "Rejected" })).rejects.toThrow("HTTP 500");
    expect(listener).not.toHaveBeenCalled();
  });

  it("sends multiple record updates in one mutation request", async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) => ({ ok: true, json: async () => ({}) }) as Response,
    );
    const changes = new DataChangeService();
    const published: string[] = [];
    changes.subscribe({ tableName: "tickets" }, (change) => published.push(change.recordId));
    const mutations = new RecordMutationService(new FetchService(fetcher), changes);

    await mutations.updateMany(definition, [
      { recordId: "ticket-1", changes: { title: "First" } },
      { recordId: "ticket-2", changes: { title: "Second" } },
    ]);

    expect(fetcher).toHaveBeenCalledOnce();
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.steps.map(({ update }: { update: { ids: string[] } }) => update.ids)).toEqual([
      ["ticket-1", "ticket-2"],
    ]);
    expect(published).toEqual(["ticket-1", "ticket-2"]);
  });
});
