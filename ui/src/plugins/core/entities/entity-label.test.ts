import { describe, expect, it } from "vitest";
import { createRoot, createMemo } from "solid-js";
import { userEntity } from "../administration/users/user-entity";
import { defineEntity } from "./entity-description";
import { entityLabel, entityRowLabel } from "./entity-label";
import { createEntityEditorDefinition } from "./entity-editor";
import { parseQueryResponse } from "../query/query-result";

describe("entity labels", () => {
  it("formats domain templates and keeps values literal", () => {
    const values: Record<string, string> = {
      key: "TEST-1",
      title: "Fix ${name}",
      name: "Jane Developer",
      username: "jane",
    };
    const description = defineEntity({
      ...userEntity,
      labelTemplate: "${name}: ${username}",
    });
    expect(entityLabel(description, (key) => (key === "name" ? values.key : values.title))).toBe("TEST-1: Fix ${name}");
    expect(entityLabel(userEntity, (key) => values[key])).toBe("Jane Developer (jane)");
    expect(entityLabel(defineEntity({ ...userEntity, labelTemplate: "${name}" }), () => "Project (internal)")).toBe(
      "Project (internal)",
    );
  });

  it("handles missing values and falls back to identity or kind", () => {
    const description = defineEntity({ ...userEntity, labelTemplate: "${name} ${username}" });
    expect(entityLabel(description, (key) => (key === "name" ? "Jane" : undefined))).toBe("Jane");
    expect(entityLabel(description, (key) => (key === "id" ? "user-1" : null))).toBe("user-1");
    expect(entityLabel(description, () => undefined)).toBe("User");
    expect(entityLabel(defineEntity({ ...userEntity, labelTemplate: undefined }), () => "user-1")).toBe("user-1");
    expect(entityLabel(defineEntity({ ...userEntity, labelTemplate: "${name}" }), () => 0)).toBe("0");
  });

  it("compiles ordered parts once and renders without reading the template again", () => {
    let reads = 0;
    const description = defineEntity({
      ...userEntity,
      get labelTemplate() {
        reads++;
        return "User: ${name}${username} (${name})";
      },
    });
    expect(description.labelParts).toEqual([
      { type: "literal", text: "User: " },
      { type: "attribute", attribute: "name" },
      { type: "attribute", attribute: "username" },
      { type: "literal", text: " (" },
      { type: "attribute", attribute: "name" },
      { type: "literal", text: ")" },
    ]);
    const initialReads = reads;
    const compiled = {
      ...description,
      get labelTemplate(): string {
        throw new Error("Template was read during rendering");
      },
    };
    expect(entityLabel(compiled, () => "A")).toBe("User: AA (A)");
    expect(entityLabel(compiled, () => "B")).toBe("User: BB (B)");
    expect(reads).toBe(initialReads);
    expect(defineEntity({ ...userEntity, labelTemplate: "Literal" }).labelParts).toEqual([
      { type: "literal", text: "Literal" },
    ]);
    expect(defineEntity({ ...userEntity, labelTemplate: undefined }).labelParts).toEqual([]);
  });

  it("rejects unknown attributes, expressions and malformed templates at definition time", () => {
    for (const labelTemplate of ["${missing}", "${name.toUpperCase()}", "${name", "${}", " "]) {
      expect(() => defineEntity({ ...userEntity, labelTemplate })).toThrow();
    }
  });

  it("uses the same reactive label in editor headings and lookup rows", () => {
    createRoot((dispose) => {
      const result = parseQueryResponse({
        number_of_hits: 1,
        result_columns: [
          { attribute: "id", values: { type: "string", values: ["user-1"] } },
          { attribute: "name", values: { type: "string", values: ["Jane"] } },
          { attribute: "username", values: { type: "string", values: ["jane"] } },
        ],
      });
      const row = result.rows[0];
      const definition = createEntityEditorDefinition(userEntity);
      const heading = createMemo(() => definition.recordLabel!(result, row));
      expect(heading()).toBe(entityRowLabel(userEntity, result, row));
      result.updateRow(row, [{ column: result.requireColumn("name"), value: "Jane Developer" }]);
      expect(heading()).toBe("Jane Developer (jane)");
      dispose();
    });
  });
});
