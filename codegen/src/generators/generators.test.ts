import { describe, expect, it } from "vitest";

import command from "../declarations/query.command.ts";
import { buildModel } from "../model/model-builder.ts";
import { defineCommand, defineStruct } from "../model/declarations.ts";
import rustGenerator from "./rust.generator.ts";
import typescriptGenerator from "./typescript.generator.ts";

const model = buildModel([{ declaration: command, sourcePath: "query.command.ts" }]);

describe("language generators", () => {
  it("generates deterministic TypeScript command contracts", () => {
    const first = typescriptGenerator.generate(model);
    expect(first).toEqual(typescriptGenerator.generate(model));
    expect(first[0]?.contents).toContain("export interface CommandRequests");
    expect(first[0]?.contents).toContain('readonly "query": QueryRequest;');
    expect(first[1]?.relativePath).toBe("api/command-service.ts");
    expect(first[1]?.contents).toContain("export class CommandService");
    expect(first[1]?.contents).toContain("async query(request: QueryRequest)");
    expect(first[1]?.contents).toContain('this.fetchService.post("/api/query"');
  });

  it("generates deterministic Rust serde contracts", () => {
    const first = rustGenerator.generate(model);
    expect(first).toEqual(rustGenerator.generate(model));
    expect(first[0]?.contents).toContain("impl Command for QueryRequest");
    expect(first[0]?.contents).toContain('const NAME: &\'static str = "query";');
    expect(first[0]?.contents).toContain("type Response = QueryResponse;");
    expect(first[0]?.contents).toContain("pub const COMMAND_DESCRIPTORS: &[CommandDescriptor]");
  });

  it("rejects names that collide after target case conversion", () => {
    const first = defineStruct({ name: "SomeType", description: "First.", fields: [] });
    const second = defineStruct({ name: "some-type", description: "Second.", fields: [] });
    const collidingModel = buildModel([
      {
        sourcePath: "collision.command.ts",
        declaration: defineCommand({
          id: "collision",
          description: "A colliding command.",
          request: first,
          response: second,
        }),
      },
    ]);
    expect(() => typescriptGenerator.generate(collidingModel)).toThrow(/both generate the name 'SomeType'/);
    expect(() => rustGenerator.generate(collidingModel)).toThrow(/both generate the name 'SomeType'/);
  });
});
