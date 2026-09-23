import { describe, expect, it } from "vitest";

import {
  compileNeedles,
  deriveColumnHighlights,
  highlightRanges,
  highlightSegments,
  MAX_HIGHLIGHT_TEXT_LENGTH,
  tokenizeHighlightText,
} from "./text-highlight";
describe("highlightRanges", () => {
  it("matches case-insensitive substrings", () => {
    const ranges = highlightRanges("Fix Navigation bug", compileNeedles([{ text: "nav", wholeWord: false }]));
    expect(ranges).toEqual([[4, 7]]);
  });

  it("restricts whole-word needles to word boundaries", () => {
    const needles = compileNeedles([{ text: "nav", wholeWord: true }]);
    expect(highlightRanges("navigation", needles)).toEqual([]);
    expect(highlightRanges("the nav bar", needles)).toEqual([[4, 7]]);
  });

  it("matches whole words across punctuation", () => {
    const needles = compileNeedles([{ text: "developer", wholeWord: true }]);
    expect(highlightRanges("jane.developer", needles)).toEqual([[5, 14]]);
  });

  it("merges overlapping ranges across needles", () => {
    const ranges = highlightRanges(
      "navigation",
      compileNeedles([
        { text: "nav", wholeWord: false },
        { text: "avig", wholeWord: false },
      ]),
    );
    expect(ranges).toEqual([[0, 5]]);
  });

  it("escapes regex syntax in needles", () => {
    const ranges = highlightRanges("TEST-1 (fixed)", compileNeedles([{ text: "T-1 (", wholeWord: false }]));
    expect(ranges).toEqual([[3, 8]]);
  });

  it("drops empty needles and skips oversized values", () => {
    expect(compileNeedles([{ text: "", wholeWord: false }])).toEqual([]);
    expect(
      highlightRanges("x".repeat(MAX_HIGHLIGHT_TEXT_LENGTH + 1), compileNeedles([{ text: "x", wholeWord: false }])),
    ).toEqual([]);
  });

  it("splits segments for rendering", () => {
    expect(highlightSegments("abc", compileNeedles([{ text: "b", wholeWord: false }]))).toEqual([
      { text: "a", highlighted: false },
      { text: "b", highlighted: true },
      { text: "c", highlighted: false },
    ]);
  });
});

describe("tokenizeHighlightText", () => {
  it("splits words like the index tokenizer", () => {
    expect(tokenizeHighlightText("Jane.Developer TEST-1")).toEqual(["jane", "developer", "test", "1"]);
    expect(tokenizeHighlightText("   ")).toEqual([]);
    expect(tokenizeHighlightText(`x${"y".repeat(60)}`)).toEqual([]);
  });
});

describe("deriveColumnHighlights", () => {
  it("fans search tokens out to every string attribute", () => {
    const highlights = deriveColumnHighlights("Jane Developer", ["title", "description"]);
    expect(highlights.get("title")?.map((needle) => needle.source)).toEqual(["jane", "developer"]);
    expect(highlights.get("description")?.map((needle) => needle.source)).toEqual(["jane", "developer"]);
  });

  it("scopes column search needles to their column", () => {
    const highlights = deriveColumnHighlights("", ["title", "description"], {
      title: "nav bug",
      description: "  ",
    });
    expect(highlights.get("title")?.map((needle) => needle.source)).toEqual(["nav", "bug"]);
    expect(highlights.has("description")).toBe(false);
  });

  it("returns no highlights when both quicksearch inputs are empty", () => {
    expect(deriveColumnHighlights("", ["title", "description"], { title: "  " })).toEqual(new Map());
  });
});
