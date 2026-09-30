import { Mark } from "@tiptap/core";
import { parseLinkReference } from "./link-reference";
import { safeRichTextHref } from "./safe-rich-text-href";

/** Keeps safe links editable without coupling callers to a specific editor package. */
export const RichTextLink = Mark.create({
  name: "link",
  inclusive: false,
  addAttributes() {
    return { href: { default: null }, ref: { default: null } };
  },
  parseHTML() {
    return [
      {
        tag: "a[href]",
        getAttrs: (element) => {
          const href = safeRichTextHref((element as HTMLElement).getAttribute("href") ?? "");
          if (!href) return false;
          const ref = (element as HTMLElement).getAttribute("data-joi-ref");
          return { href, ref: ref && parseLinkReference(ref) ? ref : null };
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const href = safeRichTextHref(String(HTMLAttributes.href ?? ""));
    const ref = String(HTMLAttributes.ref ?? "");
    return ["a", { href: href ?? "", ...(href && parseLinkReference(ref) ? { "data-joi-ref": ref } : {}) }, 0];
  },
});
