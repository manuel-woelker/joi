import { describe, expect, it } from "vitest";

import { parseQueryResponse } from "../query/query-result";
import { executeQuery, validatePresentation } from "./query";
import { createSeedWorkspace } from "./seed";

const tickets = parseQueryResponse({
  number_of_hits: 3,
  result_columns: [
    { attribute: "id", values: { type: "string", values: ["id-1", "id-2", "id-3"] } },
    { attribute: "key", values: { type: "string", values: ["TEST-1", "TEST-2", "TEST-3"] } },
    {
      attribute: "title",
      values: { type: "string", values: ["Fix navigation bug", "Add issue filters", "Review table schema"] },
    },
    {
      attribute: "description",
      values: { type: "string", values: ["Selection is lost", "Filter by status", "Check columns"] },
    },
    { attribute: "status", values: { type: "string", values: ["open", "in-progress", "closed"] } },
  ],
});

const values = (attribute: string, rows = tickets.rows) => {
  const column = tickets.requireColumn(attribute);
  return rows.map((row) => row.value(column));
};

describe("executeQuery", () => {
  it("filters with membership and supports transient text search", () => {
    const query = createSeedWorkspace().queries["query-open"];
    expect(values("key", executeQuery(tickets, query))).toEqual(["TEST-1", "TEST-2"]);
    expect(values("key", executeQuery(tickets, query, "filters"))).toEqual(["TEST-2"]);
  });

  it("preserves source order when sort values are equal", () => {
    const query = {
      ...createSeedWorkspace().queries["query-all"],
      sorting: [{ field: "status" as const, direction: "ascending" as const }],
    };
    const duplicateStatus = parseQueryResponse({
      number_of_hits: 2,
      result_columns: [
        { attribute: "id", values: { type: "string", values: ["id-1", "id-4"] } },
        { attribute: "status", values: { type: "string", values: ["open", "open"] } },
      ],
    });
    const rows = executeQuery(duplicateStatus, query);
    const id = duplicateStatus.requireColumn("id");
    expect(rows.map((row) => row.value(id))).toEqual(["id-1", "id-4"]);
  });
});

describe("validatePresentation", () => {
  it("rejects an empty presentation", () => {
    const workspace = createSeedWorkspace();
    expect(
      validatePresentation(workspace.queries["query-all"], {
        ...workspace.presentations["presentation-table"],
        fields: [],
      }),
    ).toContain("at least one field");
  });

  it("rejects unknown query and presentation attributes", () => {
    const workspace = createSeedWorkspace();
    expect(
      validatePresentation(
        { ...workspace.queries["query-all"], sorting: [{ field: "missing", direction: "ascending" }] },
        workspace.presentations["presentation-table"],
      ),
    ).toContain("does not define attribute 'missing'");
    expect(
      validatePresentation(workspace.queries["query-all"], {
        ...workspace.presentations["presentation-table"],
        fields: [{ field: "missing" }],
      }),
    ).toContain("does not define attribute 'missing'");
  });
});
