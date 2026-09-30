/** Parses one stable internal reference, splitting only the first colon. */
export function parseLinkReference(value: string): { type: string; key: string } | undefined {
  const separator = value.indexOf(":");
  if (separator < 1 || separator === value.length - 1) return undefined;
  const type = value.slice(0, separator);
  const key = value.slice(separator + 1);
  if (!/^[a-z][a-z0-9-]*$/u.test(type) || /[|\[\]]/u.test(key)) return undefined;
  return { type, key };
}

/** Parses the author-facing short form; an optional label follows the first pipe. */
export function parseLinkShortcut(value: string): { reference: string; label?: string } | undefined {
  if (!value.startsWith("[[") || !value.endsWith("]]")) return undefined;
  const [reference, ...labels] = value.slice(2, -2).split("|");
  if (labels.length > 1 || !parseLinkReference(reference)) return undefined;
  const label = labels[0];
  if (label !== undefined && (!label.trim() || /[\[\]]/u.test(label))) return undefined;
  return { reference, ...(label === undefined ? {} : { label }) };
}
