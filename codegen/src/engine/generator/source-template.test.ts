import { describe, expect, it } from "vitest";

import { source } from "./source-template.ts";

describe("source", () => {
  it("removes the shared template margin", () => {
    expect(source`
      interface Example {
        value: string;
      }
    `).toBe("interface Example {\n  value: string;\n}");
  });

  it("indents every line of an interpolated block", () => {
    const fields = "first: string;\nsecond: number;";
    expect(source`
      interface Example {
        ${fields}
      }
    `).toBe("interface Example {\n  first: string;\n  second: number;\n}");
  });
});
