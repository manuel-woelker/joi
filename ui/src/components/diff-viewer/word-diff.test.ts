import { describe, expect, it } from "vitest";
import { diffWords } from "./word-diff";

describe("diffWords", () => {
  it("highlights changed identifiers while preserving complete lines", () => {
    const result = diffWords("  includeDrafts: false,", "  includeUncommitted: true,");
    expect(result.deletion.map((part) => part.text).join("")).toBe("  includeDrafts: false,");
    expect(result.addition.map((part) => part.text).join("")).toBe("  includeUncommitted: true,");
    expect(result.deletion.filter((part) => part.changed).map((part) => part.text)).toEqual(["includeDrafts", "false"]);
    expect(result.addition.filter((part) => part.changed).map((part) => part.text)).toEqual([
      "includeUncommitted",
      "true",
    ]);
  });

  it("does not highlight identical lines", () => {
    expect(diffWords("return value;", "return value;")).toEqual({
      deletion: [{ text: "return value;", changed: false }],
      addition: [{ text: "return value;", changed: false }],
    });
  });
});
