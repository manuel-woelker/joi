import { describe, expect, it } from "vitest";

import { ticketEntity } from "./ticket-entity";
import { createEntityEditorDefinition } from "../../core/entities/entity-editor";

describe("ticketEntity", () => {
  it("lets the server generate key and creation date rather than including them in create input", () => {
    const editor = createEntityEditorDefinition(ticketEntity);
    expect(editor.create?.attributes.map((attribute) => attribute.attribute)).not.toContain("key");
    expect(editor.create?.attributes.map((attribute) => attribute.attribute)).not.toContain("creation_date");
    expect(editor.create?.fields.map((field) => field.attribute)).toContain("project_id");
    const date = ticketEntity.attributes.find((attribute) => attribute.id === "creation_date");
    expect(date?.table).toEqual({ visibleByDefault: false, width: 190, type: "date" });
  });
  it("only facets bounded categorical attributes", () => {
    expect(
      ticketEntity.attributes
        .filter((attribute) => "facet" in attribute && attribute.facet)
        .map((attribute) => attribute.id),
    ).toEqual(["project_id", "status", "assignee"]);
  });
});
