import { describe, expect, it } from "vitest";
import { largePatch, malformedPatch, metadataPatch, multipleFilesPatch, removedFilePatch } from "./diff-fixtures";
import { parsePatch } from "./patch-parser";

describe("parsePatch", () => {
  it("normalizes multiple modified and added files with exact line numbers", () => {
    const document = parsePatch(multipleFilesPatch);
    expect(document.files).toHaveLength(3);
    const review = [...document.filesById.values()].find((file) => file.displayPath === "src/review.ts");
    expect(review).toMatchObject({ displayPath: "src/review.ts", status: "modified", additions: 5, deletions: 2 });
    expect(review?.hunks[0].lines.find((line) => line.kind === "addition")).toMatchObject({ newLine: 3 });
    expect([...document.filesById.values()].find((file) => file.displayPath === "src/status.ts")).toMatchObject({
      displayPath: "src/status.ts",
      status: "added",
    });
  });

  it("normalizes deleted files", () => {
    expect(parsePatch(removedFilePatch).filesById.values().next().value).toMatchObject({
      status: "deleted",
      deletions: 3,
    });
  });

  it("retains rename, binary, mode-only, and spaced-path metadata", () => {
    const files = [...parsePatch(metadataPatch).filesById.values()];
    expect(files.map(({ displayPath, status }) => ({ displayPath, status }))).toEqual([
      { displayPath: "docs/new name.md", status: "renamed" },
      { displayPath: "assets/logo.png", status: "binary" },
      { displayPath: "script.sh", status: "mode" },
    ]);
  });

  it("ignores no-newline markers without corrupting hunk counts", () => {
    const patch =
      "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file";
    expect(parsePatch(patch).filesById.values().next().value?.hunks[0].lines).toHaveLength(2);
  });

  it("rejects malformed hunk counts", () => expect(() => parsePatch(malformedPatch)).toThrow(/Invalid hunk counts/));
  it("handles a 10,000-line fixture", () => expect(parsePatch(largePatch()).files).toHaveLength(20));
});
