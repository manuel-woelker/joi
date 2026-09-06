import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { defineCommand, defineStruct, stringType } from "../model/declarations.ts";
import { containedDiscoveryPath } from "./contained-discovery-path.ts";
import { discoverCommandDeclarations } from "./discover-command-declarations.ts";
import { discoverGenerators } from "./discover-generators.ts";

async function fixtureRoot(paths: readonly string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "joi-codegen-discovery-"));
  for (const path of paths) {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, "// loaded by test double\n");
  }
  return root;
}

const declaration = defineCommand({
  id: "example",
  description: "An example.",
  request: defineStruct({ name: "Request", description: "A request.", fields: [] }),
  response: stringType,
});

describe("runtime discovery", () => {
  it("sorts command modules before loading them", async () => {
    const root = await fixtureRoot(["commands/z.command.ts", "commands/a.command.ts"]);
    const loaded: string[] = [];
    const result = await discoverCommandDeclarations(root, "commands/*.command.ts", async (url) => {
      loaded.push(url);
      return { default: declaration };
    });
    expect(result.map((entry) => entry.sourcePath)).toEqual(["commands/a.command.ts", "commands/z.command.ts"]);
    expect(loaded[0]).toContain("a.command.ts");
  });

  it("rejects malformed command modules", async () => {
    const root = await fixtureRoot(["commands/bad.command.ts"]);
    await expect(
      discoverCommandDeclarations(root, "commands/*.command.ts", async () => ({ default: {} })),
    ).rejects.toThrow(/default export is not a command declaration/);
  });

  it("rejects discovered paths outside the configured root", () => {
    expect(() => containedDiscoveryPath("/workspace/codegen", "../outside.generator.ts")).toThrow(/escapes its root/);
  });

  it("rejects duplicate generator IDs", async () => {
    const root = await fixtureRoot(["generators/a.generator.ts", "generators/b.generator.ts"]);
    await expect(
      discoverGenerators(root, "generators/*.generator.ts", async () => ({
        default: { id: "same", label: "Same", description: "A generator.", generate: () => [] },
      })),
    ).rejects.toThrow(/duplicates generators\/a\.generator\.ts/);
  });
});
