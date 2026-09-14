import { describe, expect, it } from "vitest";
import { multipleFilesPatch } from "./diff-fixtures";
import { parsePatch } from "./patch-parser";
import { flattenDiffRows } from "./virtual-rows";

describe("flattenDiffRows", () => {
  it("places editors and comments directly after their source line", () => {
    const document = parsePatch(multipleFilesPatch);
    const rows = flattenDiffRows(document, document.files, [], {
      kind: "new",
      location: { file: "src/review.ts", line: 4, side: "additions" },
    });
    const editor = rows.findIndex((row) => row.kind === "editor");
    expect(editor).toBeGreaterThan(0);
    expect(rows[editor - 1].kind).toBe("code");
  });

  it("groups consecutive missing lines into one code block", () => {
    const document = parsePatch(multipleFilesPatch);
    const rows = flattenDiffRows(document, document.files, []);
    expect(rows.some((row) => row.kind === "code" && row.pairs.length > 1)).toBe(true);
  });
});
