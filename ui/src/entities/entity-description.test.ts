import { describe, expect, it } from "vitest";

import { parseQueryResponse } from "../query/query-result";
import { validate } from "../validation/validation";
import { bindEntity, createEntityTableColumns } from "./bound-entity";
import { createEntityEditorDefinition } from "./entity-editor";
import {
  defineEntity,
  requireEntityAttribute,
  validateEntityDescription,
  type EntityDescription,
} from "./entity-description";
import { userEntity } from "./user-entity";

const entity = defineEntity({
  id: "things",
  tableName: "things",
  label: "Thing",
  pluralLabel: "Things",
  identityAttribute: "id",
  attributes: [
    { id: "id", label: "ID", valueType: "string" },
    { id: "name", label: "Name", valueType: "string", table: { visibleByDefault: true } },
    { id: "rank", label: "Rank", valueType: "int", table: { visibleByDefault: true, width: 80 } },
  ],
});

const result = parseQueryResponse({
  number_of_hits: 1,
  result_columns: [
    { attribute: "id", values: { type: "string", values: ["thing-1"] } },
    { attribute: "name", values: { type: "string", values: ["First"] } },
    { attribute: "rank", values: { type: "int", values: [1] } },
  ],
});

describe("entity descriptions", () => {
  it("binds typed attributes and creates default table columns", () => {
    const bound = bindEntity(result, entity);
    expect(bound.identity.attribute).toBe("id");
    expect(
      createEntityTableColumns(bound).map(({ column, header, width }) => [column.attribute, header, width]),
    ).toEqual([
      ["name", "Name", undefined],
      ["rank", "Rank", 80],
    ]);
  });

  it("applies ordered presentation overrides", () => {
    const cell = () => "custom";
    const columns = createEntityTableColumns(
      bindEntity(result, entity),
      [{ attribute: "rank", label: "Priority", width: 120 }, { attribute: "name" }],
      { rank: { cell } },
    );
    expect(columns.map(({ column, header, width }) => [column.attribute, header, width])).toEqual([
      ["rank", "Priority", 120],
      ["name", "Name", undefined],
    ]);
    expect(columns[0].cell).toBe(cell);
  });

  it("rejects invalid descriptions and query bindings", () => {
    expect(() =>
      validateEntityDescription({
        id: "broken",
        tableName: "broken",
        label: "Broken",
        pluralLabel: "Broken",
        identityAttribute: "missing",
        attributes: [{ id: "id", label: "ID", valueType: "string" }],
      } as EntityDescription),
    ).toThrow("identity attribute 'missing' is not defined");
    expect(() =>
      validateEntityDescription({
        id: "duplicates",
        tableName: "duplicates",
        label: "Duplicate",
        pluralLabel: "Duplicates",
        identityAttribute: "id",
        attributes: [
          { id: "id", label: "ID", valueType: "string" },
          { id: "id", label: "Other ID", valueType: "string" },
        ],
      } as EntityDescription),
    ).toThrow("duplicate attribute 'id'");

    const wrongResult = parseQueryResponse({
      number_of_hits: 0,
      result_columns: [
        { attribute: "id", values: { type: "string", values: [] } },
        { attribute: "name", values: { type: "string", values: [] } },
        { attribute: "rank", values: { type: "string", values: [] } },
      ],
    });
    expect(() => bindEntity(wrongResult, entity)).toThrow("attribute 'rank' expects int, received string");

    const missingResult = parseQueryResponse({
      number_of_hits: 0,
      result_columns: [
        { attribute: "id", values: { type: "string", values: [] } },
        { attribute: "name", values: { type: "string", values: [] } },
      ],
    });
    expect(() => bindEntity(missingResult, entity)).toThrow("attribute 'rank' is missing from the query result");
  });

  it("keeps domain validation on its described attribute", () => {
    const name = requireEntityAttribute(userEntity, "name");
    expect(name.valueType).toBe("string");
    if (name.valueType !== "string" || !name.validation) throw new Error("User name validation is missing");
    expect(validate("Jane Developer", name.validation).failures).toEqual([]);
    expect(validate("Jane 123", name.validation).failures[0]?.message).toContain("Use only letters");
  });

  it("derives visible create fields and hidden initial values", () => {
    const create = createEntityEditorDefinition(userEntity).create;
    expect(create?.fields.map((field) => field.attribute)).toEqual(["username", "name"]);
    expect(create?.attributes.map((attribute) => attribute.attribute)).toEqual(["id", "username", "name"]);
    expect(create?.attributes[0]?.initialValue()).toMatch(/^[0-9A-Za-z]{27}$/);
  });

  it("rejects partial create definitions", () => {
    expect(() =>
      defineEntity({
        id: "partial",
        tableName: "partial",
        label: "Partial",
        pluralLabel: "Partials",
        identityAttribute: "id",
        attributes: [
          { id: "id", label: "ID", valueType: "string", create: { hidden: true, initialValue: "id-1" } },
          { id: "name", label: "Name", valueType: "string" },
        ],
      }),
    ).toThrow("create definition is missing attribute 'name'");
  });
});
