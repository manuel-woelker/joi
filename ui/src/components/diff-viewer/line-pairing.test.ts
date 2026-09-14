import { describe, expect, it } from "vitest";
import { pairHunkLines } from "./line-pairing";
import { parsePatch } from "./patch-parser";
import { multipleFilesPatch } from "./diff-fixtures";

describe("pairHunkLines", () => {
  it("pairs change runs and preserves stable identities", () => {
    const document = parsePatch(multipleFilesPatch);
    const file = document.filesById.get(document.files[0]);
    const first = pairHunkLines(file!.hunks[0]);
    const second = pairHunkLines(file!.hunks[0]);
    expect(first.map((row) => row.id)).toEqual(second.map((row) => row.id));
    expect(first.filter((row) => row.deletion?.kind === "deletion")).toHaveLength(2);
    expect(first.filter((row) => row.addition?.kind === "addition")).toHaveLength(5);
  });
});
