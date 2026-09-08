import { describe, expect, it } from "vitest";

import { defineCommand, defineStruct, stringType } from "./declarations.ts";
import { buildModel } from "./model-builder.ts";

function command(response = defineStruct({ name: "Response", description: "A response.", fields: [] })) {
  return defineCommand({
    id: "example",
    description: "An example command.",
    request: defineStruct({ name: "Request", description: "A request.", fields: [] }),
    response,
  });
}

describe("buildModel", () => {
  it("normalizes direct object references once and freezes the model", () => {
    const shared = defineStruct({
      name: "Shared",
      description: "Shared data.",
      fields: [{ name: "value", type: stringType, description: "A value." }],
    });
    const model = buildModel([
      { sourcePath: "first.command.ts", declaration: command(shared) },
      {
        sourcePath: "second.command.ts",
        declaration: defineCommand({
          id: "second",
          description: "A second command.",
          request: defineStruct({
            name: "SecondRequest",
            description: "Another request.",
            fields: [{ name: "shared", type: shared, description: "Shared input." }],
          }),
          response: shared,
        }),
      },
    ]);

    expect(model.types.filter((type) => type.id === "Shared")).toHaveLength(1);
    expect(model.commands[0]?.response).toBe(model.types.find((type) => type.id === "Shared"));
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.types)).toBe(true);
  });

  it("reports duplicate semantic names and fields with source locations", () => {
    const duplicate = defineStruct({ name: "Response", description: "Another response.", fields: [] });
    const invalidRequest = defineStruct({
      name: "Request",
      description: "A request.",
      fields: [
        { name: "value", type: stringType, description: "First." },
        { name: "value", type: stringType, description: "Second." },
        { name: "duplicate", type: duplicate, description: "Duplicate type." },
      ],
    });

    expect(() =>
      buildModel([
        { sourcePath: "first.command.ts", declaration: command() },
        {
          sourcePath: "second.command.ts",
          declaration: defineCommand({
            id: "second",
            description: "A second command.",
            request: invalidRequest,
            response: stringType,
          }),
        },
      ]),
    ).toThrow(/second\.command\.ts: request\.fields\[1\]\.name 'value' is duplicated/);
  });

  it("rejects duplicate command IDs", () => {
    expect(() =>
      buildModel([
        { sourcePath: "first.command.ts", declaration: command() },
        { sourcePath: "second.command.ts", declaration: command() },
      ]),
    ).toThrow(/command\.id 'example' duplicates first\.command\.ts/);
  });
});
