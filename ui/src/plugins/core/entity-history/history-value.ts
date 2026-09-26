import { diffWords, type WordDiffFragment } from "../../../components/diff-viewer/word-diff";

/** Format scalar data without JSON quoting; keep missing, null and empty distinct. */
export function formatHistoryValue(value: unknown): string {
  if (value === undefined) return "Not present";
  if (value === "") return "Empty";
  return typeof value === "string" ? value : JSON.stringify(value);
}

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

/** Rebuild only formatting elements, without attributes, links or executable content. */
function valueDocument(value: string, rich: boolean): HTMLElement {
  const root = document.createElement("div");
  if (!rich) {
    root.textContent = value;
    return root;
  }
  const parsed = new DOMParser().parseFromString(value, "text/html");
  const append = (node: Node, parent: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.textContent ?? ""));
    } else if (node instanceof Element && !omittedTags.has(node.localName)) {
      const target = allowedTags.has(node.localName) ? document.createElement(node.localName) : parent;
      if (target !== parent) parent.appendChild(target);
      for (const child of node.childNodes) append(child, target);
    }
  };
  for (const child of parsed.body.childNodes) append(child, root);
  return root;
}

function highlight(root: HTMLElement, fragments: readonly WordDiffFragment[], className: string): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  let fragmentIndex = 0;
  let fragmentOffset = 0;
  // Consume visible-text diff ranges across formatting boundaries without losing markup.
  for (const node of nodes) {
    let offset = 0;
    const replacement = document.createDocumentFragment();
    while (offset < node.length) {
      const fragment = fragments[fragmentIndex];
      const length = Math.min(node.length - offset, fragment.text.length - fragmentOffset);
      const text = document.createTextNode(node.data.slice(offset, offset + length));
      if (fragment.changed) {
        const mark = document.createElement("mark");
        mark.className = className;
        mark.appendChild(text);
        replacement.appendChild(mark);
      } else replacement.appendChild(text);
      offset += length;
      fragmentOffset += length;
      if (fragmentOffset === fragment.text.length) {
        fragmentIndex += 1;
        fragmentOffset = 0;
      }
    }
    node.replaceWith(replacement);
  }
  return root.innerHTML;
}

/** Safe HTML with word-level changes applied to visible text, not HTML tags. */
export function historyValueDiff(
  before: string,
  after: string,
  rich: boolean,
  removedClass: string,
  addedClass: string,
) {
  const oldRoot = valueDocument(before, rich);
  const newRoot = valueDocument(after, rich);
  const diff = diffWords(oldRoot.textContent ?? "", newRoot.textContent ?? "");
  return {
    before: highlight(oldRoot, diff.deletion, removedClass),
    after: highlight(newRoot, diff.addition, addedClass),
  };
}
