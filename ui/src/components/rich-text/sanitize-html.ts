import { safeRichTextHref } from "./safe-rich-text-href";
import { parseLinkReference } from "./link-reference";

const allowedTags = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "s",
  "strike",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);
const omittedTags = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "template"]);

/** Rebuild formatting and safe links without executable content or arbitrary attributes. */
export function sanitizedRichTextDocument(value: string): HTMLElement {
  const root = document.createElement("div");
  const parsed = new DOMParser().parseFromString(value, "text/html");
  const append = (node: Node, parent: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.textContent ?? ""));
    } else if (node instanceof Element && !omittedTags.has(node.localName)) {
      const href = node.localName === "a" ? safeRichTextHref(node.getAttribute("href") ?? "") : undefined;
      const reference = node.localName === "a" ? node.getAttribute("data-joi-ref") : null;
      const internal = !!(href && reference && parseLinkReference(reference));
      const target = allowedTags.has(node.localName) || href ? document.createElement(node.localName) : parent;
      if (href && !internal && target instanceof Element) target.setAttribute("href", href);
      if (internal && reference && target instanceof Element) target.setAttribute("data-joi-ref", reference);
      if (target !== parent) parent.appendChild(target);
      for (const child of node.childNodes) append(child, target);
    }
  };
  for (const child of parsed.body.childNodes) append(child, root);
  return root;
}

export function sanitizedRichTextHtml(value: string): string {
  return sanitizedRichTextDocument(value).innerHTML;
}
