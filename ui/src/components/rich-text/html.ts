/** Extracts user-visible text from a rich-text HTML value. */
export function richTextPlainText(html: string): string {
  if (!html.includes("<")) return html;
  const document = new DOMParser().parseFromString(html, "text/html");
  return document.body.innerText || document.body.textContent || "";
}
