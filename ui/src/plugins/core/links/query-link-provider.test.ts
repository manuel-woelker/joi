import { expect, it } from "vitest";
import { FetchService } from "../../../base/services/fetch-service";
import { queryLinkProvider } from "./query-link-provider";

it("uses indexed terms and exact keys for link searches", async () => {
  let criterion: unknown;
  const service = new FetchService(async (_input, init) => {
    criterion = (JSON.parse(String(init?.body)) as { criterion: unknown }).criterion;
    return {
      ok: true,
      json: async () => ({
        results: [
          {
            type: "rows",
            result_columns: ["id", "key", "title"].map((attribute) => ({
              attribute,
              values: { type: "string", values: [] },
            })),
          },
        ],
      }),
    } as Response;
  });
  const provider = queryLinkProvider({
    service,
    type: "ticket",
    label: "Ticket",
    table: "tickets",
    key: "key",
    title: "title",
    href: (key) => `#/entity?entity=${key}`,
  });
  await provider.search?.("TEST-42", new AbortController().signal, 20);
  expect(criterion).toEqual({
    one: [
      { equals: { attribute: "key", values: ["TEST-42"] } },
      { term: { value: "TEST-42", attributes: ["key", "title"] } },
    ],
  });
});

it("formats ticket labels without changing their link reference", async () => {
  const service = new FetchService(
    async () =>
      ({
        ok: true,
        json: async () => ({
          results: [
            {
              type: "rows",
              result_columns: [
                { attribute: "key", values: { type: "string", values: ["TEST-123"] } },
                { attribute: "title", values: { type: "string", values: ["foo"] } },
                { attribute: "id", values: { type: "string", values: ["ticket-id"] } },
              ],
            },
          ],
        }),
      }) as Response,
  );
  const provider = queryLinkProvider({
    service,
    type: "ticket",
    label: "Ticket",
    table: "tickets",
    key: "key",
    title: "title",
    formatLabel: (key, title) => `${key} - ${title}`,
    href: (key) => `#/entity?entity=${key}`,
  });

  expect(await provider.search?.("TEST-123", new AbortController().signal, 20)).toEqual([
    {
      reference: "ticket:TEST-123",
      label: "TEST-123 - foo",
      description: "TEST-123",
      href: "#/entity?entity=TEST-123",
    },
  ]);
});
