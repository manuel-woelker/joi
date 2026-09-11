import { describe, expect, it } from "vitest";

import { validate } from "../../../validation/validation";
import { createEntityEditorDefinition } from "../../core/entities/entity-editor";
import { requireEntityAttribute } from "../../core/entities/entity-description";
import { projectEntity } from "./project-entity";

describe("projectEntity", () => {
  it("describes editable and creatable project fields", () => {
    const editor = createEntityEditorDefinition(projectEntity);
    expect(editor.fields.map((field) => field.attribute)).toEqual(["name", "prefix", "description"]);
    expect(editor.create?.fields.map((field) => field.attribute)).toEqual(["name", "prefix", "description"]);
    expect(editor.create?.attributes[0]?.initialValue()).toMatch(/^[0-9A-Za-z]{27}$/);
  });

  it("requires an uppercase ticket prefix", () => {
    const prefix = requireEntityAttribute(projectEntity, "prefix");
    if (prefix.valueType !== "string" || !prefix.validation) throw new Error("Project prefix validation is missing");

    expect(validate("DEMO2", prefix.validation).failures).toEqual([]);
    expect(validate("demo", prefix.validation).failures[0]?.message).toContain("uppercase letters");
    expect(validate("2DEMO", prefix.validation).failures[0]?.message).toContain("starting with a letter");
  });
});
