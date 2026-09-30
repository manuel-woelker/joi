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

it("preserves a validated internal reference but strips malformed metadata", () => {
  const html = sanitizedRichTextHtml(
    '<a href="#:wiki:Start" data-joi-ref="wiki:Start" onclick="alert(1)">Start</a> <a href="javascript:alert(1)" data-joi-ref="wiki:Bad">bad</a>',
  );
  expect(html).toContain('data-joi-ref="wiki:Start"');
  expect(html).not.toContain('href="#:wiki:Start"');
  expect(html).not.toContain("onclick");
  expect(html).not.toContain("javascript:");
  expect(html).not.toContain('data-joi-ref="wiki:Bad"');
});
