import { describe, expect, it } from "vitest";
import { highlightLine, languageForPath } from "./syntax-highlighter";

describe("syntax highlighting", () => {
  it("recognizes common source file extensions", () => {
    expect(languageForPath("src/component.tsx")).toBe("tsx");
    expect(languageForPath("Cargo.toml")).toBe("toml");
    expect(languageForPath("assets/image.png")).toBeUndefined();
  });

  it("returns colored tokens without changing source text", async () => {
    const source = "export const answer: number = 42;";
    const tokens = await highlightLine("answer.ts", source);
    expect(tokens.map((token) => token.text).join("")).toBe(source);
    expect(tokens.some((token) => token.color)).toBe(true);
  });
});
