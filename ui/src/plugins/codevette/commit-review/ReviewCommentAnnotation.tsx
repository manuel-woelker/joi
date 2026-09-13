import PencilIcon from "lucide-solid/icons/pencil";
import ReplyIcon from "lucide-solid/icons/reply";
import { For } from "solid-js";
import { render } from "solid-js/web";
import type { ReviewComment } from "../../../generated/api/api";

export type ReviewCommentAnnotationValue =
  | {
      readonly kind: "thread";
      readonly comments: readonly ReviewCommentThreadEntry[];
      readonly currentUserId?: string;
    }
  | { readonly kind: "editor"; readonly initialValue: string; readonly editing: boolean };

export interface ReviewCommentThreadEntry {
  readonly comment: ReviewComment;
  readonly depth: number;
}

export const REVIEW_COMMENT_EDIT_EVENT = "review-comment-edit";
export const REVIEW_COMMENT_REPLY_EVENT = "review-comment-reply";
export const REVIEW_COMMENT_SAVE_EVENT = "review-comment-save";
export const REVIEW_COMMENT_CANCEL_EVENT = "review-comment-cancel";

const annotationElementName = "joi-review-comment";

class ReviewCommentAnnotationElement extends HTMLElement {
  readonly #root = this.attachShadow({ mode: "open" });
  #dispose?: () => void;
  #value?: ReviewCommentAnnotationValue;

  set value(value: ReviewCommentAnnotationValue) {
    this.#value = value;
    if (this.isConnected) this.#render();
  }

  connectedCallback(): void {
    if (!this.#dispose) this.#render();
  }

  #render(): void {
    if (!this.#value) return;
    this.#dispose?.();
    this.#root.replaceChildren();
    this.#dispose = render(() => <AnnotationContent host={this} value={this.#value!} />, this.#root);
  }

  disconnectedCallback(): void {
    this.#dispose?.();
    this.#dispose = undefined;
  }
}

if (!customElements.get(annotationElementName))
  customElements.define(annotationElementName, ReviewCommentAnnotationElement);

/** Creates an isolated annotation whose editor keeps keystrokes out of application state. */
export function createReviewCommentAnnotation(value: ReviewCommentAnnotationValue): HTMLElement {
  const host = document.createElement(annotationElementName) as ReviewCommentAnnotationElement;
  host.dataset.reviewComment = "";
  host.value = value;
  return host;
}

function AnnotationContent(props: { readonly host: HTMLElement; readonly value: ReviewCommentAnnotationValue }) {
  const emit = (name: string, detail?: unknown) =>
    props.host.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  const value = props.value;
  if (value.kind === "editor") {
    let input: HTMLTextAreaElement | undefined;
    queueMicrotask(() => input?.focus());
    return (
      <>
        <style>{annotationCss}</style>
        <article class="comment editor">
          <textarea ref={input} rows={3} placeholder="Add a review comment">
            {value.initialValue}
          </textarea>
          <div class="actions">
            <button type="button" on:click={() => emit(REVIEW_COMMENT_CANCEL_EVENT)}>
              Cancel
            </button>
            <button class="primary" type="button" on:click={() => emit(REVIEW_COMMENT_SAVE_EVENT, input?.value ?? "")}>
              {value.editing ? "Save" : "Add comment"}
            </button>
          </div>
        </article>
      </>
    );
  }
  return (
    <>
      <style>{annotationCss}</style>
      <section class="thread">
        <For each={value.comments}>
          {(entry) => (
            <article class="comment" style={{ "--reply-depth": entry.depth }}>
              <div class="text">{entry.comment.comment}</div>
              <footer>
                <div class="metadata">
                  <strong>@{entry.comment.authorUsername}</strong>
                  <time dateTime={entry.comment.createdAt}>{formatTimestamp(entry.comment.createdAt)}</time>
                </div>
                <div class="comment-actions">
                  <button
                    class="icon"
                    type="button"
                    aria-label="Reply to comment"
                    on:click={() => emit(REVIEW_COMMENT_REPLY_EVENT, entry.comment)}
                  >
                    <ReplyIcon size={14} />
                    <span class="tooltip" role="tooltip">
                      Reply to comment
                    </span>
                  </button>
                  {entry.comment.authorId === value.currentUserId && (
                    <button
                      class="icon"
                      type="button"
                      aria-label="Edit comment"
                      on:click={() => emit(REVIEW_COMMENT_EDIT_EVENT, entry.comment)}
                    >
                      <PencilIcon size={14} />
                      <span class="tooltip" role="tooltip">
                        Edit comment
                      </span>
                    </button>
                  )}
                </div>
              </footer>
            </article>
          )}
        </For>
      </section>
    </>
  );
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.valueOf())
    ? timestamp
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

const annotationCss = `
:host { display: block; color: var(--diffs-fg); font: 13px/1.45 var(--diffs-header-font-fallback); }
* { box-sizing: border-box; }
.thread { display: grid; gap: 6px; margin: 8px 12px; }
.comment { display: grid; gap: 8px; margin-left: calc(var(--reply-depth) * 18px); padding: 9px 11px; border: 1px solid color-mix(in srgb, var(--diffs-fg) 20%, transparent); border-left: 3px solid var(--diffs-modified-base); border-radius: 4px; background: color-mix(in srgb, var(--diffs-bg) 96%, var(--diffs-modified-base)); white-space: normal; }
.editor { margin: 8px 12px; }
.text { white-space: pre-wrap; overflow-wrap: anywhere; }
footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.metadata { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.comment-actions { display: flex; gap: 4px; }
strong { font-size: 12px; }
time { color: color-mix(in srgb, var(--diffs-fg) 58%, transparent); font-size: 11px; }
button { min-height: 24px; padding: 2px 8px; border: 1px solid color-mix(in srgb, var(--diffs-fg) 24%, transparent); border-radius: 3px; background: linear-gradient(var(--diffs-bg), color-mix(in srgb, var(--diffs-bg) 94%, var(--diffs-fg))); color: var(--diffs-fg); cursor: pointer; font: inherit; }
button:hover { border-color: var(--diffs-modified-base); }
.icon { position: relative; display: grid; place-items: center; width: 24px; min-width: 24px; padding: 0; }
.icon svg { display: block; }
.tooltip { position: absolute; right: 0; bottom: calc(100% + 5px); z-index: 10; display: none; width: max-content; padding: 3px 6px; border-radius: 3px; background: var(--diffs-fg); color: var(--diffs-bg); font-size: 11px; pointer-events: none; }
.icon:hover .tooltip, .icon:focus-visible .tooltip { display: block; }
.editor textarea { width: 100%; min-height: 64px; resize: vertical; color: var(--diffs-fg); background: var(--diffs-bg); border: 1px solid color-mix(in srgb, var(--diffs-fg) 28%, transparent); border-radius: 3px; padding: 6px 8px; font: inherit; }
.editor textarea:focus { outline: 1px solid var(--diffs-modified-base); outline-offset: 0; }
.actions { display: flex; gap: 6px; justify-content: flex-end; }
.primary { border-color: var(--diffs-modified-base); }
`;
