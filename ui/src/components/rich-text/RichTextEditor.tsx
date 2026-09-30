import StarterKit from "@tiptap/starter-kit";
import type { Editor } from "@tiptap/core";
import BoldIcon from "lucide-solid/icons/bold";
import CodeIcon from "lucide-solid/icons/code";
import ItalicIcon from "lucide-solid/icons/italic";
import LinkIcon from "lucide-solid/icons/link-2";
import AtSignIcon from "lucide-solid/icons/at-sign";
import ListIcon from "lucide-solid/icons/list";
import ListOrderedIcon from "lucide-solid/icons/list-ordered";
import PilcrowIcon from "lucide-solid/icons/pilcrow";
import QuoteIcon from "lucide-solid/icons/quote";
import RedoIcon from "lucide-solid/icons/redo-2";
import StrikethroughIcon from "lucide-solid/icons/strikethrough";
import UnlinkIcon from "lucide-solid/icons/link-2-off";
import UndoIcon from "lucide-solid/icons/undo-2";
import { createEffect, createSignal, createUniqueId, onCleanup, untrack, type JSX, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { createEditor, EditorContent } from "tiptap-solid";

import styles from "./RichTextEditor.module.css";
import { RichTextLink } from "./rich-text-link";
import { safeRichTextHref } from "./safe-rich-text-href";
import { parseLinkShortcut } from "./link-reference";
import { parseLinkReference } from "./link-reference";
import type { LinkCandidate, LinkPickerSource } from "./link-picker";

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
  /** Optional source for searchable internal links. */
  readonly links?: LinkPickerSource;
}

/** A controlled rich-text editor whose value is represented as HTML. */
export function RichTextEditor(props: RichTextEditorProps) {
  const headingLevels = normalizeHeadingLevels(props.headingLevels);
  const [revision, setRevision] = createSignal(0);
  const [linkOpen, setLinkOpen] = createSignal(false);
  const [linkUrl, setLinkUrl] = createSignal("");
  const [linkError, setLinkError] = createSignal("");
  const [pickerOpen, setPickerOpen] = createSignal(false);
  const [pickerQuery, setPickerQuery] = createSignal("");
  const [pickerEntries, setPickerEntries] = createSignal<readonly LinkCandidate[]>([]);
  const [pickerErrors, setPickerErrors] = createSignal<readonly string[]>([]);
  const [pickerLoading, setPickerLoading] = createSignal(false);
  const [pickerIndex, setPickerIndex] = createSignal(0);
  const [pickerPosition, setPickerPosition] = createSignal({ top: 0, left: 0 });
  const [pickerFocusInput, setPickerFocusInput] = createSignal(false);
  let pickerRange: { from: number; to: number } | undefined;
  let preserveSelectedText = false;
  let searchTimer: number | undefined;
  let searchAbort: AbortController | undefined;

  const closePicker = () => {
    setPickerOpen(false);
    setPickerLoading(false);
    window.clearTimeout(searchTimer);
    searchAbort?.abort();
  };
  const openPicker = (current: Editor, query: string, range: { from: number; to: number }, fromToolbar = false) => {
    pickerRange = range;
    preserveSelectedText = fromToolbar;
    setPickerFocusInput(fromToolbar);
    const point = current.view.coordsAtPos(range.to);
    setPickerPosition({
      top: Math.max(8, Math.min(point.bottom + 4, window.innerHeight - 280)),
      left: Math.max(8, Math.min(point.left, window.innerWidth - 330)),
    });
    setPickerQuery(query);
    setPickerOpen(true);
  };
  const selectTarget = (candidate: LinkCandidate, label?: string) => {
    const current = editor();
    if (!current || !pickerRange || !parseLinkReference(candidate.reference) || !safeRichTextHref(candidate.href))
      return;
    const selected =
      preserveSelectedText && pickerRange.to > pickerRange.from
        ? current.state.doc.textBetween(pickerRange.from, pickerRange.to)
        : undefined;
    current
      .chain()
      .focus()
      .insertContentAt(pickerRange, {
        type: "text",
        text: label ?? selected ?? candidate.label,
        marks: [{ type: "link", attrs: { href: candidate.href, ref: candidate.reference } }],
      })
      .run();
    closePicker();
  };
  const completeShortcut = async (current: Editor, text: string, from: number, to: number) => {
    const shortcut = parseLinkShortcut(text);
    if (!shortcut || !props.links) return;
    const controller = new AbortController();
    const [target] = await props.links.resolve([shortcut.reference], controller.signal);
    if (!target || current.isDestroyed) return;
    if (current.state.doc.textBetween(from, to) !== text) return;
    pickerRange = { from, to };
    preserveSelectedText = false;
    selectTarget(target, shortcut.label);
  };
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
      handleKeyDown: (_view, event) => {
        if (!pickerOpen()) return false;
        if (event.key === "Escape") {
          closePicker();
          return true;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          setPickerIndex(
            (index) =>
              (index + (event.key === "ArrowDown" ? 1 : -1) + pickerEntries().length) %
              Math.max(1, pickerEntries().length),
          );
          return true;
        }
        if (event.key === "Enter" && pickerEntries()[pickerIndex()]) {
          selectTarget(pickerEntries()[pickerIndex()]);
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!props.links || !parseLinkShortcut(text)) return false;
        const current = editor();
        if (!current) return false;
        const from = current.state.selection.from;
        current.commands.insertContent(text);
        void completeShortcut(current, text, from, from + text.length);
        return true;
      },
    },
    onUpdate({ editor: currentEditor }) {
      setRevision((value) => value + 1);
      props.onChange?.(currentEditor.getHTML());
      if (!props.links || props.readOnly || props.disabled || !currentEditor.state.selection.empty) return;
      const to = currentEditor.state.selection.from;
      const before = currentEditor.state.doc.textBetween(Math.max(0, to - 160), to, "\n");
      const shortcut = before.match(/\[\[([^\]\n]*)\]\]$/u);
      if (shortcut) {
        closePicker();
        void completeShortcut(currentEditor, shortcut[0], to - shortcut[0].length, to);
        return;
      }
      const active = before.match(/\[\[([^\]\n]*)$/u);
      if (active) openPicker(currentEditor, active[1], { from: to - active[0].length, to });
      else if (pickerOpen()) closePicker();
    },
    onSelectionUpdate() {
      setRevision((value) => value + 1);
    },
  });

  createEffect(() => {
    if (!pickerOpen()) return;
    const source = props.links;
    if (!source) return;
    const query = pickerQuery();
    searchAbort?.abort();
    window.clearTimeout(searchTimer);
    setPickerEntries([]);
    setPickerErrors([]);
    setPickerIndex(0);
    if (!query.trim() || /:$/.test(query.trim())) {
      setPickerLoading(false);
      return;
    }
    setPickerLoading(true);
    searchTimer = window.setTimeout(() => {
      const controller = new AbortController();
      searchAbort = controller;
      const showResults = (result: {
        readonly entries: readonly LinkCandidate[];
        readonly errors: readonly string[];
      }) => {
        if (controller.signal.aborted) return;
        setPickerEntries(result.entries);
        setPickerErrors(result.errors);
        setPickerIndex((index) => Math.min(index, Math.max(0, result.entries.length - 1)));
      };
      void source
        .search(query, controller.signal, showResults)
        .then((result) => {
          if (controller.signal.aborted) return;
          showResults(result);
          setPickerLoading(false);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setPickerErrors([error instanceof Error ? error.message : String(error)]);
          setPickerLoading(false);
        });
    }, 180);
  });
  onCleanup(() => closePicker());

  createEffect(() => {
    const currentEditor = editor();
    if (!currentEditor) return;
    const editable = !props.readOnly && !props.disabled;
    if (currentEditor.isEditable !== editable) untrack(() => currentEditor.setEditable(editable));
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
          <Show when={props.links}>
            <EditorButton
              label="Link to entity"
              onClick={() => {
                const current = editor();
                if (current) {
                  if (current.isActive("link") && current.state.selection.empty)
                    current.chain().extendMarkRange("link").run();
                  openPicker(current, "", { from: current.state.selection.from, to: current.state.selection.to }, true);
                }
              }}
            >
              <AtSignIcon size={15} />
            </EditorButton>
          </Show>
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
              editor()?.chain().focus().setMark("link", { href, ref: null }).run();
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
      <Show when={pickerOpen()}>
        <Portal>
          <div
            class={styles.linkPicker}
            style={{ top: `${pickerPosition().top}px`, left: `${pickerPosition().left}px` }}
            role="listbox"
            aria-label="Link targets"
            onMouseDown={(event) => event.preventDefault()}
          >
            <input
              ref={(element) => {
                if (pickerFocusInput()) queueMicrotask(() => element.focus());
              }}
              aria-label="Search link targets"
              value={pickerQuery()}
              onInput={(event) => setPickerQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  closePicker();
                  event.preventDefault();
                } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  setPickerIndex(
                    (index) =>
                      (index + (event.key === "ArrowDown" ? 1 : -1) + pickerEntries().length) %
                      Math.max(1, pickerEntries().length),
                  );
                  event.preventDefault();
                } else if (event.key === "Enter" && pickerEntries()[pickerIndex()]) {
                  selectTarget(pickerEntries()[pickerIndex()]);
                  event.preventDefault();
                }
              }}
            />
            <Show when={pickerLoading()}>
              <div class={styles.pickerStatus}>Searching...</div>
            </Show>
            <For each={pickerEntries()}>
              {(entry, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={index() === pickerIndex()}
                  class={styles.pickerEntry}
                  onClick={() => selectTarget(entry)}
                >
                  <strong>{entry.label}</strong>
                  <small>{entry.description ?? entry.reference}</small>
                </button>
              )}
            </For>
            <Show when={!pickerLoading() && !pickerEntries().length && !pickerErrors().length}>
              <div class={styles.pickerStatus}>{pickerQuery().trim() ? "No targets found" : "Type to search"}</div>
            </Show>
            <For each={pickerErrors()}>
              {(error) => (
                <div class={styles.pickerStatus} role="alert">
                  {error}
                </div>
              )}
            </For>
            <Show when={pickerErrors().length}>
              <button type="button" onClick={() => setPickerQuery((value) => `${value} `)}>
                Retry
              </button>
            </Show>
          </div>
        </Portal>
      </Show>
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
