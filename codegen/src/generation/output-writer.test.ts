import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { GeneratedFile } from "./generated-file.ts";
import { synchronizeOutput } from "./output-writer.ts";

const file: GeneratedFile = { relativePath: "api.ts", contents: "export {};\n", format: "typescript" };

describe("synchronizeOutput", () => {
  it("writes manifests and preserves unchanged file timestamps", async () => {
    const root = await mkdtemp(join(tmpdir(), "joi-codegen-output-"));
    await synchronizeOutput(root, [file], "generate");
    const first = await stat(join(root, "api.ts"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    await synchronizeOutput(root, [file], "generate");
    const second = await stat(join(root, "api.ts"));

    expect(second.mtimeMs).toBe(first.mtimeMs);
    expect(JSON.parse(await readFile(join(root, ".joi-codegen-manifest.json"), "utf8"))).toEqual({ files: ["api.ts"] });
  });

  it("reports stale and manifest-owned unexpected files without changing them", async () => {
    const root = await mkdtemp(join(tmpdir(), "joi-codegen-output-"));
    await synchronizeOutput(root, [file], "generate");
    await writeFile(join(root, "api.ts"), "changed\n");
    const issues = await synchronizeOutput(root, [], "check");
    expect(issues.some((issue) => issue.startsWith("unexpected:"))).toBe(true);
    expect(await readFile(join(root, "api.ts"), "utf8")).toBe("changed\n");
  });

  it("rejects path traversal and duplicate output", async () => {
    const root = await mkdtemp(join(tmpdir(), "joi-codegen-output-"));
    await expect(synchronizeOutput(root, [{ ...file, relativePath: "../escape.ts" }], "check")).rejects.toThrow(
      /escapes output root/,
    );
    await expect(synchronizeOutput(root, [file, file], "check")).rejects.toThrow(/Duplicate generated output/);
  });
});
