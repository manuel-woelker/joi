import { describe, expect, expectTypeOf, it } from "vitest";

import { parseQueryResponse, type QueryColumnIndex, type QueryRowIndex } from "./query-result";

const response = (columns: unknown[], numberOfHits = 2) => ({
  number_of_hits: numberOfHits,
  result_columns: columns,
});

describe("query result", () => {
  it("provides indexed access to string and integer columns", () => {
    const result = parseQueryResponse(
      response(
        [
          { attribute: "name", values: { type: "string", values: ["Jane", "Joe"] } },
          { attribute: "age", values: { type: "int", values: [34, 41] } },
        ],
        20,
      ),
    );

    expect(result.numberOfHits).toBe(20);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1].value(result.requireColumn("name"))).toBe("Joe");
    expect(result.rows[1].value(result.requireColumn("age"))).toBe(41);
  });

  it("supports an empty projection as zero renderable rows", () => {
    const result = parseQueryResponse(response([], 8));
    expect(result.numberOfHits).toBe(8);
    expect(result.rows).toEqual([]);
  });

  it.each([
    ["malformed response", null],
    ["unknown value tag", response([{ attribute: "name", values: { type: "bool", values: [true] } }])],
    ["invalid integer", response([{ attribute: "age", values: { type: "int", values: [1.5] } }])],
    [
      "duplicate attributes",
      response([
        { attribute: "name", values: { type: "string", values: [] } },
        { attribute: "name", values: { type: "string", values: [] } },
      ]),
    ],
    [
      "unequal column lengths",
      response([
        { attribute: "name", values: { type: "string", values: ["Jane"] } },
        { attribute: "age", values: { type: "int", values: [34, 41] } },
      ]),
    ],
  ])("rejects %s", (_, payload) => {
    expect(() => parseQueryResponse(payload)).toThrow();
  });

  it("rejects a column handle from another result", () => {
    const first = parseQueryResponse(
      response([{ attribute: "name", values: { type: "string", values: ["Jane"] } }], 1),
    );
    const second = parseQueryResponse(
      response([{ attribute: "name", values: { type: "string", values: ["Joe"] } }], 1),
    );
    expect(() => first.rows[0].value(second.requireColumn("name"))).toThrow("different result");
  });

  it("keeps row and column indexes distinct from each other and numbers", () => {
    expectTypeOf<QueryRowIndex>().not.toEqualTypeOf<QueryColumnIndex>();
    expectTypeOf<QueryRowIndex>().not.toEqualTypeOf<number>();
    expectTypeOf<QueryColumnIndex>().not.toEqualTypeOf<number>();
  });
});
