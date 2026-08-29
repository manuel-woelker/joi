import { describe, expect, it } from "vitest";

import { parseQueryResponse } from "../query/query-result";
import { validateMasterDetailDefinition, type MasterDetailDefinition } from "./definition";

const result = parseQueryResponse({
  number_of_hits: 1,
  result_columns: [
    { attribute: "id", values: { type: "string", values: ["one"] } },
    { attribute: "name", values: { type: "string", values: ["Example"] } },
    { attribute: "rank", values: { type: "int", values: [1] } },
  ],
});

const definition = (fields: MasterDetailDefinition["fields"]): MasterDetailDefinition => ({
  tableName: "records",
  identityAttribute: "id",
  detailTitle: "Record details",
  fields,
});

describe("master-detail definition", () => {
  it("accepts compatible string and integer fields", () => {
    expect(() =>
      validateMasterDetailDefinition(
        result,
        definition([
          { attribute: "name", label: "Name", control: "text" },
          { attribute: "rank", label: "Rank", control: "integer" },
        ]),
      ),
    ).not.toThrow();
  });

  it("rejects missing, duplicate, and incompatible fields", () => {
    expect(() =>
      validateMasterDetailDefinition(result, definition([{ attribute: "missing", label: "Missing", control: "text" }])),
    ).toThrow("does not contain attribute missing");
    expect(() =>
      validateMasterDetailDefinition(
        result,
        definition([
          { attribute: "name", label: "Name", control: "text" },
          { attribute: "name", label: "Again", control: "text" },
        ]),
      ),
    ).toThrow("Duplicate");
    expect(() =>
      validateMasterDetailDefinition(result, definition([{ attribute: "rank", label: "Rank", control: "text" }])),
    ).toThrow("requires string values");
  });
});
