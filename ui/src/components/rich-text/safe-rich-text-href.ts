/** Accepts safe external links and namespace-scoped entity hash links. */
export function safeRichTextHref(value: string): string | undefined {
  const href = value.trim();
  if (/^#:[^:\s]+:[^\s]+$/u.test(href)) return href;
  try {
    const url = new URL(href);
    if (["http:", "https:", "mailto:"].includes(url.protocol)) return href;
  } catch {
    // Relative URLs are not supported in stored rich text.
  }
  return undefined;
}
