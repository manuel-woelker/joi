import { describe, expect, it } from "vitest";

import { parseQueryResponse } from "../query/query-result";
import { validate } from "../validation/validation";
import { defineEntity } from "./entity-description";
import { createEntityEditorDefinition } from "./entity-editor";

const rangedEntity = defineEntity({
  id: "ranges",
  tableName: "ranges",
  label: "Range",
  pluralLabel: "Ranges",
  identityAttribute: "id",
  attributes: [
    { id: "id", label: "ID", valueType: "string" },
    { id: "name", label: "Name", valueType: "string" },
    {
      id: "minimum",
      label: "Minimum",
      valueType: "int",
      edit: { control: "integer", required: true },
      validation({ value, addValidationFailure }) {
        if (value < 0) addValidationFailure({ message: "Minimum cannot be negative." });
      },
    },
    { id: "maximum", label: "Maximum", valueType: "int", edit: { control: "integer", required: true } },
  ],
  validation({ value, addValidationFailure }) {
    if (value.minimum > value.maximum) {
      addValidationFailure({ attribute: "maximum", message: "Maximum must not be less than minimum." });
    }
  },
});

const result = parseQueryResponse({
  number_of_hits: 1,
  result_columns: [
    { attribute: "id", values: { type: "string", values: ["range-1"] } },
    { attribute: "name", values: { type: "string", values: ["Example"] } },
    { attribute: "minimum", values: { type: "int", values: [1] } },
    { attribute: "maximum", values: { type: "int", values: [10] } },
  ],
});

describe("entity editor definitions", () => {
  it("derives editable fields and adapts typed attribute validation", () => {
    const definition = createEntityEditorDefinition(rangedEntity);
    expect(definition.fields.map(({ attribute, control }) => [attribute, control])).toEqual([
      ["minimum", "integer"],
      ["maximum", "integer"],
    ]);

    const minimumValidation = definition.fields[0].validation!;
    expect(validate("invalid", minimumValidation).failures).toEqual([{ message: "Minimum must be an integer." }]);
    expect(validate("-1", minimumValidation).failures).toEqual([{ message: "Minimum cannot be negative." }]);
  });

  it("parses editable values and forwards full typed values to entity validation", () => {
    const validation = createEntityEditorDefinition(rangedEntity).validation!(result, result.rows[0]);
    expect(validate({ minimum: "8", maximum: "3" }, validation).failures).toEqual([
      { attribute: "maximum", message: "Maximum must not be less than minimum." },
    ]);
    expect(validate({ minimum: "1", maximum: "10" }, validation).failures).toEqual([]);
  });
});
