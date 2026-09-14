import { createVirtualizer } from "@tanstack/solid-virtual";
import CheckIcon from "lucide-solid/icons/check";
import PencilIcon from "lucide-solid/icons/pencil";
import ReplyIcon from "lucide-solid/icons/reply";
import XIcon from "lucide-solid/icons/x";
import { createEffect, createMemo, createResource, createSignal, For, onMount, Show } from "solid-js";
import type { ReviewComment } from "../../generated/api/api";
import { Tree } from "../tree/Tree";
import type { CommentThreadEntry, ReviewCommentSource } from "./comment-model";
import { createDiffViewerStore, type CommentEditor as CommentEditorState } from "./diff-viewer-store";
import { type DiffFileId, type DiffLine, type DiffLocation } from "./diff-model";
import { buildDiffFileTree, diffFileTreeDefinition } from "./file-tree";
import { parsePatch } from "./patch-parser";
import { highlightLine, type SyntaxToken } from "./syntax-highlighter";
import styles from "./DiffViewer.module.css";
import { flattenDiffRows, type VirtualDiffRow } from "./virtual-rows";
import { diffWords, type WordDiffFragment } from "./word-diff";

export interface DiffViewerProps {
  readonly patch: string;
  readonly comments?: ReviewCommentSource;
  readonly height?: number;
  readonly showDiagnostics?: boolean;
  /** Disable virtualization for tests or very small embedded patches. */
  readonly virtualized?: boolean;
}

/** Renders a virtualized, commentable side-by-side Git patch. */
export function DiffViewer(props: DiffViewerProps) {
  let parseError: string | undefined;
  let document;
  try {
    document = parsePatch(props.patch);
  } catch (reason) {
    parseError = reason instanceof Error ? reason.message : String(reason);
    document = parsePatch("");
  }
  const controller = createDiffViewerStore(document, props.comments);
  const tree = createMemo(() => buildDiffFileTree(document, controller.state.fileFilter));
  const visibleFiles = createMemo(() => [...tree().fileByNode.values()]);
  const rows = createMemo(() => {
    const editor = controller.state.editor;
    const comments = [...controller.state.comments];
    return flattenDiffRows(document, visibleFiles(), comments, editor);
  });
  let viewport: HTMLDivElement | undefined;
  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    get count() {
      return rows().length;
    },
    getScrollElement: () => viewport ?? null,
    estimateSize: (index) => estimateHeight(rows()[index]),
    overscan: 12,
    initialRect: { width: 900, height: props.height ?? 560 },
  });
  createEffect(() => {
    rows();
    virtualizer.measure();
    if (controller.state.editor) {
      queueMicrotask(() => {
        const index = rows().findIndex((row) => row.kind === "editor");
        if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
      });
    }
  });
  const selectFile = (id: DiffFileId) => {
    controller.selectFile(id);
    const index = rows().findIndex((row) => row.kind === "file" && row.file.id === id);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "start" });
  };
  onMount(() => void controller.load());
  return (
    <div class={styles.viewer} style={{ height: `${props.height ?? 560}px` }}>
      <aside class={styles.files}>
        <label class={styles.filter}>
          <span>Filter files</span>
          <input
            value={controller.state.fileFilter}
            onInput={(event) => controller.setFileFilter(event.currentTarget.value)}
            placeholder="Path..."
          />
        </label>
        <Show when={tree().model.roots.length} fallback={<p class={styles.empty}>No matching files.</p>}>
          <Tree
            ariaLabel="Changed files"
            model={tree().model}
            definition={diffFileTreeDefinition(tree(), controller.state.selectedFile, selectFile)}
            expanded={tree().expanded}
          />
        </Show>
      </aside>
      <main ref={viewport} class={styles.viewport} aria-label="Diff">
        <Show when={!parseError} fallback={<p class={styles.error}>{parseError}</p>}>
          <Show when={rows().length} fallback={<p class={styles.empty}>This patch has no text changes.</p>}>
            <Show
              when={props.virtualized !== false}
              fallback={
                <For each={rows()}>
                  {(row) => (
                    <div data-row-id={row.id}>
                      <DiffRow
                        row={row}
                        controller={controller}
                        commentable={Boolean(props.comments)}
                        currentUserId={props.comments?.currentUserId}
                      />
                    </div>
                  )}
                </For>
              }
            >
              <div class={styles.virtualCanvas} style={{ height: `${virtualizer.getTotalSize()}px` }}>
                <For each={virtualizer.getVirtualItems()}>
                  {(item) => {
                    return (
                      <Show when={rows()[item.index]} keyed>
                        {(row) => (
                          <div
                            ref={(element) =>
                              queueMicrotask(() => element.isConnected && virtualizer.measureElement(element))
                            }
                            data-index={item.index}
                            data-row-id={row.id}
                            class={styles.virtualRow}
                            style={{
                              transform: `translateY(${item.start}px)`,
                            }}
                          >
                            <DiffRow
                              row={row}
                              controller={controller}
                              commentable={Boolean(props.comments)}
                              currentUserId={props.comments?.currentUserId}
                            />
                          </div>
                        )}
                      </Show>
                    );
                  }}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
        <Show when={props.showDiagnostics}>
          <output class={styles.diagnostics}>
            {virtualizer.getVirtualItems().length} / {rows().length} rows rendered
          </output>
        </Show>
      </main>
    </div>
  );
}

function DiffRow(props: {
  readonly row: VirtualDiffRow;
  readonly controller: ReturnType<typeof createDiffViewerStore>;
  readonly commentable: boolean;
  readonly currentUserId?: string;
}) {
  switch (props.row.kind) {
    case "file":
      return (
        <header class={styles.fileHeader}>
          <strong>{props.row.file.displayPath}</strong>
          <span class={styles.counts}>
            -{props.row.file.deletions} +{props.row.file.additions}
          </span>
        </header>
      );
    case "info":
      return (
        <p class={styles.info}>{props.row.file.status === "binary" ? "Binary file changed" : "File mode changed"}</p>
      );
    case "hunk":
      return <div class={styles.hunk}>{props.row.header}</div>;
    case "code":
      return (
        <CodeBlock
          row={props.row}
          commentable={props.commentable}
          open={(location) => props.controller.openCommentEditor(location)}
        />
      );
    case "thread":
      return (
        <div class={styles.thread}>
          <For each={props.row.entries}>
            {(entry) => (
              <Comment
                entry={entry}
                currentUserId={props.currentUserId}
                editor={props.controller.state.editor}
                saving={props.controller.state.saving}
                error={props.controller.state.error}
                edit={props.controller.openCommentEdit}
                reply={(comment) =>
                  props.controller.openCommentEditor(
                    { file: comment.file, line: comment.line, side: comment.side },
                    comment.id,
                  )
                }
                save={props.controller.saveComment}
                cancel={props.controller.cancelCommentEdit}
              />
            )}
          </For>
        </div>
      );
    case "editor": {
      const editor = props.row.editor;
      const editing =
        editor.kind === "edit"
          ? props.controller.state.comments.find((comment) => comment.id === editor.commentId)
          : undefined;
      return (
        <CommentEditor
          initialValue={editing?.comment ?? ""}
          saving={props.controller.state.saving}
          error={props.controller.state.error}
          save={props.controller.saveComment}
          cancel={props.controller.cancelCommentEdit}
        />
      );
    }
  }
}

function CodeBlock(props: {
  readonly row: Extract<VirtualDiffRow, { readonly kind: "code" }>;
  readonly commentable: boolean;
  readonly open: (location: DiffLocation) => void;
}) {
  const deletions = () => props.row.pairs.filter((pair) => Boolean(pair.deletion));
  const additions = () => props.row.pairs.filter((pair) => Boolean(pair.addition));
  return (
    <div class={styles.codeBlock}>
      <Show when={deletions().length} fallback={<div class={styles.placeholder} aria-hidden="true" />}>
        <div class={styles.codeBlockSide}>
          <For each={deletions()}>
            {(pair) => (
              <CodeSide
                line={pair.deletion!}
                comparison={pair.addition}
                side="deletions"
                file={props.row.file.displayPath}
                commentable={props.commentable}
                open={props.open}
              />
            )}
          </For>
        </div>
      </Show>
      <Show when={additions().length} fallback={<div class={styles.placeholder} aria-hidden="true" />}>
        <div class={styles.codeBlockSide}>
          <For each={additions()}>
            {(pair) => (
              <CodeSide
                line={pair.addition!}
                comparison={pair.deletion}
                side="additions"
                file={props.row.file.displayPath}
                commentable={props.commentable}
                open={props.open}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function CodeSide(props: {
  readonly line?: DiffLine;
  readonly comparison?: DiffLine;
  readonly side: "additions" | "deletions";
  readonly file: string;
  readonly commentable: boolean;
  readonly open: (location: DiffLocation) => void;
}) {
  const open = props.open;
  const number = () => (props.side === "additions" ? props.line?.newLine : props.line?.oldLine);
  const words = createMemo(() => codeFragments(props.line, props.comparison, props.side));
  const [syntax] = createResource(
    () => (props.line ? { path: props.file, code: props.line.content } : undefined),
    ({ path, code }) => highlightLine(path, code),
  );
  const fragments = createMemo(() => combineHighlighting(syntax() ?? [{ text: props.line?.content ?? "" }], words()));
  return (
    <div
      class={styles.codeSide}
      classList={{
        [styles.addition]: props.line?.kind === "addition",
        [styles.deletion]: props.line?.kind === "deletion",
        [styles.placeholder]: !props.line,
      }}
    >
      <Show when={number()}>
        <Show when={props.commentable} fallback={<span class={styles.lineNumber}>{number()}</span>}>
          <button
            type="button"
            class={`${styles.lineNumber} ${styles.gutter}`}
            aria-label={`Comment on ${props.side === "additions" ? "new" : "old"} line ${number()}`}
            on:click={() => open({ file: props.file, line: number()!, side: props.side })}
          >
            {number()}
          </button>
        </Show>
      </Show>
      <span class={styles.marker}>
        {props.line?.kind === "addition" ? "+" : props.line?.kind === "deletion" ? "-" : " "}
      </span>
      <code>
        <For each={fragments()}>
          {(fragment) => (
            <span
              style={{ color: fragment.color }}
              classList={{
                [styles.wordAddition]: fragment.changed && props.side === "additions",
                [styles.wordDeletion]: fragment.changed && props.side === "deletions",
              }}
            >
              {fragment.text}
            </span>
          )}
        </For>
      </code>
    </div>
  );
}

function codeFragments(
  line: DiffLine | undefined,
  comparison: DiffLine | undefined,
  side: "additions" | "deletions",
): readonly WordDiffFragment[] {
  if (!line) return [];
  if (!comparison || line.kind === "context" || comparison.kind === "context") {
    return [{ text: line.content, changed: false }];
  }
  const words =
    side === "deletions" ? diffWords(line.content, comparison.content) : diffWords(comparison.content, line.content);
  return side === "deletions" ? words.deletion : words.addition;
}

interface HighlightedFragment extends WordDiffFragment {
  readonly color?: string;
}

function combineHighlighting(
  syntax: readonly SyntaxToken[],
  words: readonly WordDiffFragment[],
): readonly HighlightedFragment[] {
  const result: HighlightedFragment[] = [];
  let syntaxIndex = 0;
  let wordIndex = 0;
  let syntaxOffset = 0;
  let wordOffset = 0;
  while (syntaxIndex < syntax.length && wordIndex < words.length) {
    const syntaxToken = syntax[syntaxIndex];
    const word = words[wordIndex];
    const length = Math.min(syntaxToken.text.length - syntaxOffset, word.text.length - wordOffset);
    result.push({
      text: syntaxToken.text.slice(syntaxOffset, syntaxOffset + length),
      color: syntaxToken.color,
      changed: word.changed,
    });
    syntaxOffset += length;
    wordOffset += length;
    if (syntaxOffset === syntaxToken.text.length) {
      syntaxIndex += 1;
      syntaxOffset = 0;
    }
    if (wordOffset === word.text.length) {
      wordIndex += 1;
      wordOffset = 0;
    }
  }
  return result;
}

function Comment(props: {
  readonly entry: CommentThreadEntry;
  readonly currentUserId?: string;
  readonly editor?: CommentEditorState;
  readonly saving: boolean;
  readonly error?: string;
  readonly edit: (id: string) => void;
  readonly reply: (comment: ReviewComment) => void;
  readonly save: (text: string) => Promise<void>;
  readonly cancel: () => void;
}) {
  const isEditing = () => props.editor?.kind === "edit" && props.editor.commentId === props.entry.comment.id;
  return (
    <article class={styles.comment} style={{ "--comment-depth": Math.min(props.entry.depth, 3) }}>
      <Show
        when={isEditing()}
        fallback={
          <>
            <p>{props.entry.comment.comment}</p>
            <footer>
              <span>
                @{props.entry.comment.authorUsername} · {new Date(props.entry.comment.createdAt).toLocaleString()}
              </span>
              <Show when={props.currentUserId === props.entry.comment.authorId}>
                <IconAction label="Edit comment" onClick={() => props.edit(props.entry.comment.id)}>
                  <PencilIcon size={14} />
                </IconAction>
              </Show>
              <IconAction label="Reply" onClick={() => props.reply(props.entry.comment)}>
                <ReplyIcon size={14} />
              </IconAction>
            </footer>
          </>
        }
      >
        <CommentEditor
          inline
          initialValue={props.entry.comment.comment}
          saving={props.saving}
          error={props.error}
          save={props.save}
          cancel={props.cancel}
        />
      </Show>
    </article>
  );
}

function IconAction(props: { readonly label: string; readonly onClick: () => void; readonly children: unknown }) {
  return (
    <span class={styles.iconAction}>
      <button type="button" aria-label={props.label} onClick={props.onClick}>
        {props.children as never}
      </button>
      <span role="tooltip">{props.label}</span>
    </span>
  );
}

function CommentEditor(props: {
  readonly inline?: boolean;
  readonly initialValue: string;
  readonly saving: boolean;
  readonly error?: string;
  readonly save: (text: string) => Promise<void>;
  readonly cancel: () => void;
}) {
  const [draft, setDraft] = createSignal(props.initialValue);
  return (
    <form
      class={styles.editor}
      classList={{ [styles.inlineEditor]: props.inline }}
      onSubmit={(event) => {
        event.preventDefault();
        void props.save(draft()).catch(() => undefined);
      }}
    >
      <textarea
        aria-label="Comment"
        autofocus
        value={draft()}
        onInput={(event) => setDraft(event.currentTarget.value)}
      />
      <div>
        <Show when={props.error}>
          <span class={styles.error}>{props.error}</span>
        </Show>
        <button type="button" aria-label="Cancel comment" onClick={props.cancel}>
          <XIcon size={14} /> Cancel
        </button>
        <button type="submit" disabled={!draft().trim() || props.saving}>
          <CheckIcon size={14} /> {props.saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

function estimateHeight(row: VirtualDiffRow) {
  return row.kind === "thread"
    ? Math.max(46, row.entries.length * 42)
    : row.kind === "editor"
      ? 88
      : row.kind === "file"
        ? 38
        : row.kind === "code"
          ? row.pairs.length * 20
          : 22;
}
