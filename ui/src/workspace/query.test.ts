import { describe, expect, it } from "vitest";

import type { Ticket } from "./model";
import { executeQuery, validatePresentation } from "./query";
import { createSeedWorkspace } from "./seed";

const tickets: Ticket[] = [
  { id: "id-1", key: "TEST-1", title: "Fix navigation bug", description: "Selection is lost", status: "open" },
  { id: "id-2", key: "TEST-2", title: "Add issue filters", description: "Filter by status", status: "in-progress" },
  { id: "id-3", key: "TEST-3", title: "Review table schema", description: "Check columns", status: "closed" },
];

describe("executeQuery", () => {
  it("filters with membership and supports transient text search", () => {
    const query = createSeedWorkspace().queries["query-open"];
    expect(executeQuery(tickets, query).map((ticket) => ticket.key)).toEqual(["TEST-1", "TEST-2"]);
    expect(executeQuery(tickets, query, "filters").map((ticket) => ticket.key)).toEqual(["TEST-2"]);
  });

  it("preserves source order when sort values are equal", () => {
    const query = {
      ...createSeedWorkspace().queries["query-all"],
      sorting: [{ field: "status" as const, direction: "ascending" as const }],
    };
    const duplicateStatus = [{ ...tickets[0] }, { ...tickets[0], id: "id-4", key: "TEST-4" }];
    expect(executeQuery(duplicateStatus, query).map((ticket) => ticket.id)).toEqual(["id-1", "id-4"]);
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
});
