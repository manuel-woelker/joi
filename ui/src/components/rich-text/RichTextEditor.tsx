import StarterKit from "@tiptap/starter-kit";
import BoldIcon from "lucide-solid/icons/bold";
import CodeIcon from "lucide-solid/icons/code";
import ItalicIcon from "lucide-solid/icons/italic";
import ListIcon from "lucide-solid/icons/list";
import ListOrderedIcon from "lucide-solid/icons/list-ordered";
import PilcrowIcon from "lucide-solid/icons/pilcrow";
import QuoteIcon from "lucide-solid/icons/quote";
import RedoIcon from "lucide-solid/icons/redo-2";
import StrikethroughIcon from "lucide-solid/icons/strikethrough";
import UndoIcon from "lucide-solid/icons/undo-2";
import { createEffect, createSignal, createUniqueId, Show, type JSX } from "solid-js";
import { createEditor, EditorContent } from "tiptap-solid";

import styles from "./RichTextEditor.module.css";

/** Heading levels supported by the rich-text document model. */
export type RichTextHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** Public properties for editing an HTML document. */
export interface RichTextEditorProps {
  /** Accessible name describing the edited document. */
  readonly ariaLabel: string;
  /** Current document encoded as HTML. */
  readonly value: string;
  /** Receives the complete HTML document after each user edit. */
  readonly onChange?: (html: string) => void;
  /** Prevents document and formatting changes. */
  readonly readOnly?: boolean;
  /** Available heading levels, or `false` to disable headings. Defaults to levels 1 through 3. */
  readonly headingLevels?: readonly RichTextHeadingLevel[] | false;
}

/** A controlled rich-text editor whose value is represented as HTML. */
export function RichTextEditor(props: RichTextEditorProps) {
  const headingLevels = normalizeHeadingLevels(props.headingLevels);
  const [revision, setRevision] = createSignal(0);
  const editor = createEditor({
    extensions: [StarterKit.configure({ heading: headingLevels === false ? false : { levels: headingLevels } })],
    content: props.value,
    editable: !props.readOnly,
    editorProps: {
      attributes: {
        "aria-label": props.ariaLabel,
        "aria-multiline": "true",
        class: styles.document,
        role: "textbox",
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
    currentEditor.setEditable(!props.readOnly);
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
    <div class={styles.editor} classList={{ [styles.readOnly]: props.readOnly }}>
      <Show when={!props.readOnly}>
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
      </Show>
      <EditorContent editor={editor()} />
    </div>
  );
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
