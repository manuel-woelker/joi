import { describe, expect, it } from "vitest";

import { ticketEntity } from "./ticket-entity";

describe("ticketEntity", () => {
  it("only facets bounded categorical attributes", () => {
    expect(
      ticketEntity.attributes
        .filter((attribute) => "facet" in attribute && attribute.facet)
        .map((attribute) => attribute.id),
    ).toEqual(["project_id", "status", "assignee"]);
  });
});
