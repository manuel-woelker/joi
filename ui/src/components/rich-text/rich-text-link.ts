import { Mark } from "@tiptap/core";
import { safeRichTextHref } from "./safe-rich-text-href";

/** Keeps safe links editable without coupling callers to a specific editor package. */
export const RichTextLink = Mark.create({
  name: "link",
  inclusive: false,
  addAttributes() {
    return { href: { default: null } };
  },
  parseHTML() {
    return [
      {
        tag: "a[href]",
        getAttrs: (element) => {
          const href = safeRichTextHref((element as HTMLElement).getAttribute("href") ?? "");
          return href ? { href } : false;
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const href = safeRichTextHref(String(HTMLAttributes.href ?? ""));
    return ["a", { href: href ?? "" }, 0];
  },
});
