import { describe, expect, it } from "vitest";

import { generateKsuid } from "./ksuid";

describe("generateKsuid", () => {
  it("generates a deterministic standard base62 KSUID", () => {
    const id = generateKsuid(new Date("2026-08-30T12:00:00Z"), (bytes) => bytes.fill(0x2a));
    expect(id).toMatch(/^[0-9A-Za-z]{27}$/);
    expect(id).toBe(generateKsuid(new Date("2026-08-30T12:00:00Z"), (bytes) => bytes.fill(0x2a)));
  });
});
