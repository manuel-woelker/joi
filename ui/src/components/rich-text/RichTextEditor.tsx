import StarterKit from "@tiptap/starter-kit";
import BoldIcon from "lucide-solid/icons/bold";
import CodeIcon from "lucide-solid/icons/code";
import ItalicIcon from "lucide-solid/icons/italic";
import LinkIcon from "lucide-solid/icons/link-2";
import ListIcon from "lucide-solid/icons/list";
import ListOrderedIcon from "lucide-solid/icons/list-ordered";
import PilcrowIcon from "lucide-solid/icons/pilcrow";
import QuoteIcon from "lucide-solid/icons/quote";
import RedoIcon from "lucide-solid/icons/redo-2";
import StrikethroughIcon from "lucide-solid/icons/strikethrough";
import UnlinkIcon from "lucide-solid/icons/link-2-off";
import UndoIcon from "lucide-solid/icons/undo-2";
import { createEffect, createSignal, createUniqueId, type JSX, Show } from "solid-js";
import { createEditor, EditorContent } from "tiptap-solid";

import styles from "./RichTextEditor.module.css";
import { RichTextLink } from "./rich-text-link";
import { safeRichTextHref } from "./safe-rich-text-href";

/** Heading levels supported by the rich-text document model. */
export type RichTextHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** Public properties for editing an HTML document. */
export interface RichTextEditorProps {
  /** Optional DOM identifier used to associate an external label. */
  readonly id?: string;
  /** Accessible name describing the edited document. */
  readonly ariaLabel: string;
  /** Current document encoded as HTML. */
  readonly value: string;
  /** Receives the complete HTML document after each user edit. */
  readonly onChange?: (html: string) => void;
  /** Called when focus leaves the editable document. */
  readonly onBlur?: () => void;
  /** Prevents document and formatting changes. */
  readonly readOnly?: boolean;
  /** Makes the document unavailable for interaction. */
  readonly disabled?: boolean;
  /** Marks the document as having validation failures. */
  readonly invalid?: boolean;
  /** IDs of elements that describe the editor. */
  readonly describedBy?: string;
  /** Available heading levels, or `false` to disable headings. Defaults to levels 1 through 3. */
  readonly headingLevels?: readonly RichTextHeadingLevel[] | false;
  /** Renders the editing surface without a surrounding input frame. */
  readonly plain?: boolean;
}

/** A controlled rich-text editor whose value is represented as HTML. */
export function RichTextEditor(props: RichTextEditorProps) {
  const headingLevels = normalizeHeadingLevels(props.headingLevels);
  const [revision, setRevision] = createSignal(0);
  const [linkOpen, setLinkOpen] = createSignal(false);
  const [linkUrl, setLinkUrl] = createSignal("");
  const [linkError, setLinkError] = createSignal("");
  const editor = createEditor({
    extensions: [
      StarterKit.configure({ heading: headingLevels === false ? false : { levels: headingLevels } }),
      RichTextLink,
    ],
    content: props.value,
    editable: !props.readOnly && !props.disabled,
    editorProps: {
      attributes: {
        "aria-label": props.ariaLabel,
        "aria-multiline": "true",
        class: styles.document,
        id: props.id ?? "",
        role: "textbox",
      },
      handleDOMEvents: {
        blur: () => {
          props.onBlur?.();
          return false;
        },
      },
    },
    onUpdate({ editor: currentEditor }) {
      setRevision((value) => value + 1);
      props.onChange?.(currentEditor.getHTML());
    },
    onSelectionUpdate() {
      setRevision((value) => value + 1);
    },
  });

  createEffect(() => {
    const currentEditor = editor();
    if (!currentEditor) return;
    currentEditor.setEditable(!props.readOnly && !props.disabled);
    setOptionalAttribute(currentEditor.view.dom, "aria-disabled", props.disabled ? "true" : undefined);
    setOptionalAttribute(currentEditor.view.dom, "aria-invalid", props.invalid ? "true" : undefined);
    setOptionalAttribute(currentEditor.view.dom, "aria-describedby", props.describedBy);
  });

  createEffect(() => {
    const currentEditor = editor();
    if (!currentEditor || currentEditor.getHTML() === props.value) return;
    currentEditor.commands.setContent(props.value, false);
    setRevision((value) => value + 1);
  });

  const isActive = (name: string, attributes?: Record<string, unknown>) => {
    revision();
    return editor()?.isActive(name, attributes) ?? false;
  };
  const activeHeading = () => {
    revision();
    if (headingLevels === false) return "";
    return String(headingLevels.find((level) => editor()?.isActive("heading", { level })) ?? "");
  };

  return (
    <div
      class={styles.editor}
      classList={{ [styles.readOnly]: props.readOnly, [styles.disabled]: props.disabled, [styles.plain]: props.plain }}
    >
      <Show when={!props.readOnly && !props.disabled}>
        <div class={styles.toolbar} role="toolbar" aria-label="Text formatting">
          <EditorButton
            label="Paragraph"
            active={isActive("paragraph")}
            onClick={() => editor()?.chain().focus().setParagraph().run()}
          >
            <PilcrowIcon size={15} />
          </EditorButton>
          <Show when={headingLevels !== false}>
            <select
              class={styles.headingSelect}
              aria-label="Heading level"
              value={activeHeading()}
              onChange={(event) => {
                const level = Number(event.currentTarget.value) as RichTextHeadingLevel;
                if (headingLevels !== false && headingLevels.includes(level)) {
                  editor()?.chain().focus().setHeading({ level }).run();
                }
              }}
            >
              <option value="" disabled>
                Heading
              </option>
              {headingLevels === false
                ? undefined
                : headingLevels.map((level) => <option value={level}>Heading {level}</option>)}
            </select>
          </Show>
          <span class={styles.separator} aria-hidden="true" />
          <EditorButton
            label="Bold"
            active={isActive("bold")}
            onClick={() => editor()?.chain().focus().toggleBold().run()}
          >
            <BoldIcon size={15} />
          </EditorButton>
          <EditorButton
            label="Italic"
            active={isActive("italic")}
            onClick={() => editor()?.chain().focus().toggleItalic().run()}
          >
            <ItalicIcon size={15} />
          </EditorButton>
          <EditorButton
            label="Strikethrough"
            active={isActive("strike")}
            onClick={() => editor()?.chain().focus().toggleStrike().run()}
          >
            <StrikethroughIcon size={15} />
          </EditorButton>
          <EditorButton
            label="Inline code"
            active={isActive("code")}
            onClick={() => editor()?.chain().focus().toggleCode().run()}
          >
            <CodeIcon size={15} />
          </EditorButton>
          <EditorButton
            label="Link"
            active={isActive("link")}
            onClick={() => {
              setLinkUrl(String(editor()?.getAttributes("link").href ?? ""));
              setLinkError("");
              setLinkOpen((open) => !open);
            }}
          >
            <LinkIcon size={15} />
          </EditorButton>
          <span class={styles.separator} aria-hidden="true" />
          <EditorButton
            label="Bulleted list"
            active={isActive("bulletList")}
            onClick={() => editor()?.chain().focus().toggleBulletList().run()}
          >
            <ListIcon size={15} />
          </EditorButton>
          <EditorButton
            label="Numbered list"
            active={isActive("orderedList")}
            onClick={() => editor()?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrderedIcon size={15} />
          </EditorButton>
          <EditorButton
            label="Block quote"
            active={isActive("blockquote")}
            onClick={() => editor()?.chain().focus().toggleBlockquote().run()}
          >
            <QuoteIcon size={15} />
          </EditorButton>
          <span class={styles.spacer} />
          <EditorButton label="Undo" onClick={() => editor()?.chain().focus().undo().run()}>
            <UndoIcon size={15} />
          </EditorButton>
          <EditorButton label="Redo" onClick={() => editor()?.chain().focus().redo().run()}>
            <RedoIcon size={15} />
          </EditorButton>
        </div>
        <Show when={linkOpen()}>
          <form
            class={styles.linkForm}
            onSubmit={(event) => {
              event.preventDefault();
              const href = safeRichTextHref(linkUrl());
              if (!href) {
                setLinkError("Enter a valid URL or #:namespace:key link.");
                return;
              }
              editor()?.chain().focus().setMark("link", { href }).run();
              setLinkOpen(false);
            }}
          >
            <input
              aria-label="Link URL"
              value={linkUrl()}
              onInput={(event) => setLinkUrl(event.currentTarget.value)}
              placeholder="#:wiki:Start"
            />
            <button type="submit">Apply link</button>
            <button
              type="button"
              aria-label="Remove link"
              onClick={() => {
                editor()?.chain().focus().unsetMark("link").run();
                setLinkOpen(false);
              }}
            >
              <UnlinkIcon size={15} />
            </button>
            <Show when={linkError()}>{(message) => <span role="alert">{message()}</span>}</Show>
          </form>
        </Show>
      </Show>
      <EditorContent editor={editor()} />
    </div>
  );
}

function setOptionalAttribute(element: HTMLElement, name: string, value: string | undefined): void {
  if (value === undefined) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

function normalizeHeadingLevels(
  levels: readonly RichTextHeadingLevel[] | false | undefined,
): RichTextHeadingLevel[] | false {
  if (levels === false) return false;
  const configured: readonly RichTextHeadingLevel[] = levels ?? [1, 2, 3];
  return [...new Set<RichTextHeadingLevel>(configured)].sort((left, right) => left - right);
}

function EditorButton(props: {
  readonly label: string;
  readonly active?: boolean;
  readonly onClick: () => void;
  readonly children: JSX.Element;
}) {
  const tooltipId = createUniqueId();
  return (
    <button
      type="button"
      class={styles.toolbarButton}
      classList={{ [styles.active]: props.active }}
      aria-label={props.label}
      aria-describedby={tooltipId}
      aria-pressed={props.active}
      onClick={props.onClick}
    >
      {props.children}
      <span id={tooltipId} role="tooltip" class={styles.tooltip}>
        {props.label}
      </span>
    </button>
  );
}
