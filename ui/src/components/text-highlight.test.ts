import { describe, expect, it } from "vitest";

import {
  compileNeedles,
  deriveColumnHighlights,
  highlightRanges,
  highlightSegments,
  MAX_HIGHLIGHT_TEXT_LENGTH,
  tokenizeHighlightText,
} from "./text-highlight";
import { createCompositeFilter } from "./filter-definition/filter-model";
import { filterAttributeId, filterNodeId } from "./filter-definition/filter-model";

function criterion(
  attribute: string,
  operator: "contains" | "equals" | "in-set" | "not-equals",
  operand: { type: "value"; value: string } | { type: "set"; values: string[] },
) {
  return {
    id: filterNodeId(`${attribute}-${operator}`),
    type: "criterion" as const,
    attribute: filterAttributeId(attribute),
    operator: operator as never,
    operand: operand as never,
  };
}

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
  it("keeps needles scoped to their attribute", () => {
    const filter = {
      ...createCompositeFilter(),
      children: [criterion("title", "contains", { type: "value", value: "nav" })],
    };
    const highlights = deriveColumnHighlights(filter, "", ["title", "description"]);
    expect([...highlights.keys()]).toEqual(["title"]);
  });

  it("fans search tokens out to every string attribute", () => {
    const highlights = deriveColumnHighlights(undefined, "Jane Developer", ["title", "description"]);
    expect(highlights.get("title")?.map((needle) => needle.source)).toEqual(["jane", "developer"]);
    expect(highlights.get("description")?.map((needle) => needle.source)).toEqual(["jane", "developer"]);
  });

  it("scopes column search needles to their column", () => {
    const highlights = deriveColumnHighlights(undefined, "", ["title", "description"], {
      title: "nav bug",
      description: "  ",
    });
    expect(highlights.get("title")?.map((needle) => needle.source)).toEqual(["nav", "bug"]);
    expect(highlights.has("description")).toBe(false);
  });

  it("ignores disabled, negated, and non-textual predicates", () => {
    const filter = {
      ...createCompositeFilter(),
      children: [
        { ...criterion("title", "contains", { type: "value", value: "nav" }), disabled: true },
        {
          ...createCompositeFilter(),
          kind: "none" as const,
          children: [criterion("title", "contains", { type: "value", value: "hidden" })],
        },
        criterion("status", "not-equals", { type: "value", value: "open" }),
        {
          id: filterNodeId("range"),
          type: "criterion" as const,
          attribute: filterAttributeId("count"),
          operator: "in-range" as never,
          operand: { type: "range", minimum: 1, maximum: 5 } as never,
        },
      ],
    };
    expect(deriveColumnHighlights(filter, "", ["title"])).toEqual(new Map());
  });

  it("collects equals and in-set values", () => {
    const filter = {
      ...createCompositeFilter(),
      children: [
        criterion("status", "equals", { type: "value", value: "open" }),
        criterion("key", "in-set", { type: "set", values: ["TEST-1", "TEST-2"] }),
      ],
    };
    const highlights = deriveColumnHighlights(filter, "", ["status", "key"]);
    expect(highlights.get("status")?.map((needle) => needle.source)).toEqual(["open"]);
    expect(highlights.get("key")?.map((needle) => needle.source)).toEqual(["TEST-1", "TEST-2"]);
  });
});
