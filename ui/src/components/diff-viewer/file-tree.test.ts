import { describe, expect, it } from "vitest";
import { buildDiffFileTree } from "./file-tree";
import { multipleFilesPatch } from "./diff-fixtures";
import { parsePatch } from "./patch-parser";

describe("buildDiffFileTree", () => {
  it("matches case-insensitive whitespace-separated path tokens", () => {
    const tree = buildDiffFileTree(parsePatch(multipleFilesPatch), "SRC status");
    expect(tree.fileByNode.size).toBe(1);
    expect([...tree.model.nodes.values()].map((node) => node.data.label)).toContain("status.ts");
  });
});
