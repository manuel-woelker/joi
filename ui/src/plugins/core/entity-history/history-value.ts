import { diffWords, type WordDiffFragment } from "../../../components/diff-viewer/word-diff";
import { sanitizedRichTextDocument } from "../../../components/rich-text/sanitize-html";

/** Format scalar data without JSON quoting; keep missing, null and empty distinct. */
export function formatHistoryValue(value: unknown): string {
  if (value === undefined) return "-";
  if (value === "") return "Empty";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function valueDocument(value: string, rich: boolean): HTMLElement {
  if (rich) return sanitizedRichTextDocument(value);
  const root = document.createElement("div");
  root.textContent = value;
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

/** Safe HTML with optional word-level changes applied to visible text, not HTML tags. */
export function historyValueDiff(
  before: string,
  after: string,
  rich: boolean,
  removedClass: string,
  addedClass: string,
  highlightChanges = true,
) {
  const oldRoot = valueDocument(before, rich);
  const newRoot = valueDocument(after, rich);
  if (!highlightChanges) return { before: oldRoot.innerHTML, after: newRoot.innerHTML };
  const diff = diffWords(oldRoot.textContent ?? "", newRoot.textContent ?? "");
  return {
    before: highlight(oldRoot, diff.deletion, removedClass),
    after: highlight(newRoot, diff.addition, addedClass),
  };
}
