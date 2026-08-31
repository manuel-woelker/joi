import { describe, expect, it, vi } from "vitest";

import { FetchService } from "../services/fetch-service";
import type { MasterDetailDefinition } from "./definition";
import { createRecord, updateRecord } from "./record-api";

describe("record API", () => {
  it("sends string and integer fields in one typed update", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => ({ ok: true, json: async () => ({}) }) as Response,
    );
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

  it("sends an empty optional lookup as null", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => ({ ok: true, json: async () => ({}) }) as Response,
    );
    const assignee = {
      attribute: "assignee",
      label: "Assignee",
      control: "lookup",
      optional: true,
    } as const;

    await updateRecord(
      new FetchService(fetcher),
      { tableName: "tickets", identityAttribute: "id", detailTitle: "Ticket", fields: [assignee] },
      "ticket-1",
      [{ field: assignee, value: "" }],
    );

    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      steps: [
        {
          update: {
            table_name: "tickets",
            ids: ["ticket-1"],
            columns: [{ attribute: "assignee", values: { type: "nullable_string", values: [null] } }],
          },
        },
      ],
    });
  });

  it("sends a complete typed insert and returns its identity", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => ({ ok: true, json: async () => ({}) }) as Response,
    );
    const definition: MasterDetailDefinition = {
      tableName: "things",
      identityAttribute: "id",
      detailTitle: "Thing",
      fields: [],
      create: {
        title: "New thing",
        fields: [],
        attributes: [
          { attribute: "id", valueType: "string", initialValue: () => "thing-2" },
          { attribute: "rank", valueType: "int", initialValue: () => 0 },
        ],
      },
    };

    await expect(createRecord(new FetchService(fetcher), definition, { id: "thing-2", rank: 7 })).resolves.toBe(
      "thing-2",
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      steps: [
        {
          insert: {
            table_name: "things",
            columns: [
              { attribute: "id", values: { type: "string", values: ["thing-2"] } },
              { attribute: "rank", values: { type: "int", values: [7] } },
            ],
          },
        },
      ],
    });
  });

  it("rejects create values that do not match the described type", async () => {
    const definition: MasterDetailDefinition = {
      tableName: "things",
      identityAttribute: "id",
      detailTitle: "Thing",
      fields: [],
      create: {
        title: "New thing",
        fields: [],
        attributes: [
          { attribute: "id", valueType: "string", initialValue: () => "thing-2" },
          { attribute: "rank", valueType: "int", initialValue: () => 0 },
        ],
      },
    };
    await expect(createRecord(new FetchService(vi.fn()), definition, { id: "thing-2", rank: "seven" })).rejects.toThrow(
      "Create value for rank must be int",
    );
  });
});
