import { describe, expect, it } from "vitest";
import { parseLinkReference, parseLinkShortcut } from "./link-reference";
import { safeRichTextHref } from "./safe-rich-text-href";

describe("internal link references", () => {
  it("splits only the first colon and preserves key case", () => {
    expect(parseLinkReference("wiki:Start:Here")).toEqual({ type: "wiki", key: "Start:Here" });
    expect(parseLinkShortcut("[[ticket:TEST-42|Review this]]")).toEqual({
      reference: "ticket:TEST-42",
      label: "Review this",
    });
  });

  it.each(["Wiki:Start", "wiki:", ":Start", "wiki:a|b", "wiki:[[x]]"])("rejects malformed reference %s", (value) => {
    expect(parseLinkReference(value)).toBeUndefined();
  });

  it("rejects malformed shortcuts and unsafe hrefs", () => {
    expect(parseLinkShortcut("[[wiki:Start|one|two]]")).toBeUndefined();
    expect(safeRichTextHref("javascript:alert(1)")).toBeUndefined();
    expect(safeRichTextHref("#/entity?entity=ticket%3ATEST-1")).toBeTruthy();
  });
});
