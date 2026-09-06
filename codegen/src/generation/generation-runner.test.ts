import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { targets } from "../codegen.config.ts";
import { runGeneration } from "./generation-runner.ts";

const codegenRoot = fileURLToPath(new URL("../..", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

describe("runGeneration", () => {
  it("matches the formatted output created by the codegen task prerequisite", async () => {
    await expect(runGeneration({ codegenRoot, repositoryRoot, mode: "check", targets })).resolves.toEqual([]);
  });
});
