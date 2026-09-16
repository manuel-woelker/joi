// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { richTextPlainText } from "./html";

describe("richTextPlainText", () => {
  it("extracts visible text without exposing markup", () => {
    expect(richTextPlainText("<h2>Summary</h2><p>A <strong>rich</strong> description.</p>")).toContain("Summary");
    expect(richTextPlainText("<p>A <strong>rich</strong> description.</p>")).toBe("A rich description.");
  });

  it("treats an empty editor document as empty", () => {
    expect(richTextPlainText("<p></p>")).toBe("");
  });
});
