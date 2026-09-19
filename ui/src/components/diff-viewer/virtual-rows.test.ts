import { describe, expect, it } from "vitest";
import type { ReviewComment } from "../../generated/api/api";
import { multipleFilesPatch } from "./diff-fixtures";
import { parsePatch } from "./patch-parser";
import { flattenCommentRows, flattenDiffRows } from "./virtual-rows";

describe("flattenDiffRows", () => {
  it("places editors and comments directly after their source line", () => {
    const document = parsePatch(multipleFilesPatch);
    const rows = flattenDiffRows(document, document.files, [], {
      kind: "new",
      location: { file: "src/review.ts", line: 5, side: "additions" },
    });
    const editor = rows.findIndex((row) => row.kind === "editor");
    expect(editor).toBeGreaterThan(0);
    // The editor follows the exact commented line, not the end of the run.
    const preceding = rows[editor - 1];
    expect(preceding.kind).toBe("code");
    expect(preceding.kind === "code" && preceding.pairs.map((pair) => pair.addition?.newLine)).toEqual([5]);
    const following = rows[editor + 1];
    expect(following.kind).toBe("code");
    expect(following.kind === "code" && following.pairs.map((pair) => pair.addition?.newLine)).toEqual([6, 7]);
  });

  it("joins the run through a mid-run line and splits only after it", () => {
    const document = parsePatch(multipleFilesPatch);
    const rows = flattenDiffRows(document, document.files, [], {
      kind: "new",
      location: { file: "src/review.ts", line: 6, side: "additions" },
    });
    const editor = rows.findIndex((row) => row.kind === "editor");
    expect(editor).toBeGreaterThan(0);
    const preceding = rows[editor - 1];
    expect(preceding.kind).toBe("code");
    expect(preceding.kind === "code" && preceding.pairs.map((pair) => pair.addition?.newLine)).toEqual([5, 6]);
    const following = rows[editor + 1];
    expect(following.kind).toBe("code");
    expect(following.kind === "code" && following.pairs.map((pair) => pair.addition?.newLine)).toEqual([7]);
  });

  it("groups consecutive missing lines into one code block", () => {
    const document = parsePatch(multipleFilesPatch);
    const rows = flattenDiffRows(document, document.files, []);
    expect(rows.some((row) => row.kind === "code" && row.pairs.length > 1)).toBe(true);
  });

  it("splits a missing-line run after a commented line", () => {
    const document = parsePatch(multipleFilesPatch);
    const comment: ReviewComment = {
      id: "comment-1",
      commitId: "commit-1",
      createdAt: "2026-01-02T00:00:00Z",
      authorId: "user-1",
      authorUsername: "jane",
      parentId: null,
      file: "src/review.ts",
      line: 6,
      side: "additions",
      comment: "This line is in the additions-only run.",
    };
    const rows = flattenDiffRows(document, document.files, [comment]);
    const threadIndex = rows.findIndex((row) => row.kind === "thread");
    const preceding = rows[threadIndex - 1];

    expect(preceding.kind).toBe("code");
    expect(preceding.kind === "code" && preceding.pairs.map((pair) => pair.addition?.newLine)).toEqual([5, 6]);
    const following = rows[threadIndex + 1];
    expect(following.kind).toBe("code");
    expect(following.kind === "code" && following.pairs.map((pair) => pair.addition?.newLine)).toEqual([7]);
  });

  it("keeps comment editors inline instead of emitting a separate row", () => {
    const document = parsePatch(multipleFilesPatch);
    const rows = flattenDiffRows(document, document.files, [], {
      kind: "edit",
      commentId: "comment-1",
      location: { file: "src/review.ts", line: 4, side: "additions" },
    });
    expect(rows.some((row) => row.kind === "editor")).toBe(false);
  });

  it("shows only comment threads and nearby code context", () => {
    const document = parsePatch(multipleFilesPatch);
    const comment: ReviewComment = {
      id: "comment-1",
      commitId: "commit-1",
      createdAt: "2026-01-02T00:00:00Z",
      authorId: "user-1",
      authorUsername: "jane",
      parentId: null,
      file: "src/review.ts",
      line: 4,
      side: "additions",
      comment: "Keep this readable.",
    };
    const rows = flattenCommentRows(document, document.files, [comment], undefined, 1);

    expect(rows.some((row) => row.kind === "thread")).toBe(true);
    expect(rows.filter((row) => row.kind === "file")).toHaveLength(1);
    expect(rows.some((row) => row.kind === "file" && row.file.displayPath === "src/status.ts")).toBe(false);
    expect(rows.filter((row) => row.kind === "code").length).toBeLessThanOrEqual(3);
  });
});
