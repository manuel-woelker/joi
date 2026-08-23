import { describe, expect, it } from "vitest";

import { executeQuery, validatePresentation } from "./query";
import { createSeedWorkspace, tickets } from "./seed";

describe("executeQuery", () => {
  it("filters with membership and supports transient text search", () => {
    const query = createSeedWorkspace().queries["query-open"];
    expect(executeQuery(tickets, query).map((ticket) => ticket.id)).toEqual(["JOI-142", "JOI-139", "JOI-136"]);
    expect(executeQuery(tickets, query, "keyboard").map((ticket) => ticket.id)).toEqual(["JOI-139"]);
  });

  it("preserves source order when sort values are equal", () => {
    const query = { ...createSeedWorkspace().queries["query-all"], sorting: [{ field: "assignee" as const, direction: "ascending" as const }] };
    expect(executeQuery(tickets, query).filter((ticket) => ticket.assignee === "Mira").map((ticket) => ticket.id)).toEqual(["JOI-142", "JOI-136"]);
  });
});

describe("validatePresentation", () => {
  it("rejects an empty presentation", () => {
    const workspace = createSeedWorkspace();
    expect(validatePresentation(workspace.queries["query-all"], { ...workspace.presentations["presentation-table"], fields: [] })).toContain("at least one field");
  });
});
