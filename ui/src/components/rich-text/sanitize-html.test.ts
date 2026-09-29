// @vitest-environment happy-dom

import { expect, it } from "vitest";
import { sanitizedRichTextHtml } from "./sanitize-html";

it("keeps wiki alias links but strips unsafe link destinations", () => {
  const html = sanitizedRichTextHtml(
    '<p><a href="#:wiki:Start">Start</a> <a href="javascript:alert(1)">Unsafe</a></p>',
  );
  expect(html).toContain('<a href="#:wiki:Start">Start</a>');
  expect(html).toContain("Unsafe");
  expect(html).not.toContain("javascript:");
});
