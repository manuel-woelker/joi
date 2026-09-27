// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { PluginRegistryBuilder, plugin } from "../../../base/plugin-registry";
import { DataTable } from "../../../components/DataTable";
import { entityFilterAttributes } from "../../../components/filter-definition/entity-filter-attributes";
import { operatorsForAttribute } from "../../../components/filter-definition/filter-operators";
import { LookupProvider, lookupDefinitions, lookupId, lookupEntryId } from "../lookups/lookup";
import { parseQueryResponse } from "../query/query-result";
import { bindEntity, createEntityTableColumns } from "./bound-entity";
import { defineEntity, entityId } from "./entity-description";

afterEach(cleanup);
const entity = defineEntity({
  id: entityId("pages"),
  tableName: "pages",
  label: "Page",
  pluralLabel: "Pages",
  identityAttribute: "id",
  icon: () => null,
  attributes: [
    { id: "id", label: "ID", valueType: "string", generated: true },
    {
      id: "authors",
      label: "Authors",
      valueType: "reference_list",
      lookup: lookupId("users"),
      generated: true,
      table: { visibleByDefault: true },
      facet: true,
    },
  ],
});

it("renders every list reference using user labels and disables list sorting", async () => {
  const registry = new PluginRegistryBuilder()
    .register(
      plugin({
        name: "test",
        description: "Test lookups",
        registerExtensionPoints(context) {
          context.registerExtensionPoint({ point: lookupDefinitions });
        },
        registerExtensions(context) {
          context.registerExtension({
            point: lookupDefinitions,
            id: "users",
            description: "Users",
            value: {
              id: lookupId("users"),
              label: "Users",
              sourceTableName: "users",
              load: async () => [
                { id: lookupEntryId("jane"), label: "Jane Developer (jane)" },
                { id: lookupEntryId("joe"), label: "Joe Tester (joe)" },
              ],
            },
          });
        },
      }),
    )
    .build();
  const result = parseQueryResponse({
    number_of_hits: 1,
    result_columns: [
      { attribute: "id", values: { type: "string", values: ["page-1"] } },
      { attribute: "authors", values: { type: "reference_list", values: [["jane", "joe"]] } },
    ],
  });
  const columns = createEntityTableColumns(bindEntity(result, entity));
  expect(columns[0].sortable).toBe(false);
  render(() => (
    <LookupProvider registry={registry}>
      <DataTable ariaLabel="Pages" result={result} columns={columns} />
    </LookupProvider>
  ));
  await vi.waitFor(() => expect(screen.getByRole("cell").textContent).toBe("Jane Developer (jane), Joe Tester (joe)"));
  result.updateRow(result.rows[0], [{ column: result.requireColumn("authors"), value: ["joe"] }]);
  expect(await screen.findByRole("cell", { name: "Joe Tester (joe)" })).toBeTruthy();
});

it("offers membership and presence operators, not ranges or substring filters", () => {
  const authors = entityFilterAttributes(entity).find((attribute) => attribute.id === "authors")!;
  expect(operatorsForAttribute(authors).map((operator) => operator.id)).toEqual([
    "equals",
    "not-equals",
    "set",
    "unset",
    "in-set",
  ]);
});

it("rejects malformed reference lists and accepts empty lists", () => {
  const response = (value: unknown) => ({
    number_of_hits: 1,
    result_columns: [{ attribute: "authors", values: { type: "reference_list", values: [value] } }],
  });
  expect(() => parseQueryResponse(response([1]))).toThrow("invalid values");
  expect(() => parseQueryResponse(response([""]))).toThrow("invalid values");
  expect(() => parseQueryResponse(response("jane"))).toThrow("invalid values");
  const result = parseQueryResponse(response([]));
  expect(result.rows[0].value(result.requireColumn("authors"))).toEqual([]);
});
