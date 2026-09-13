import { FileDiff, type DiffLineAnnotation, type FileDiffMetadata } from "@pierre/diffs";
import type { DiffSide, ReviewComment } from "../../../generated/api/api";
import {
  createReviewCommentAnnotation,
  REVIEW_COMMENT_CANCEL_EVENT,
  REVIEW_COMMENT_EDIT_EVENT,
  REVIEW_COMMENT_REPLY_EVENT,
  REVIEW_COMMENT_SAVE_EVENT,
  type ReviewCommentThreadEntry,
} from "./ReviewCommentAnnotation";

export interface CommentDraft {
  readonly file: string;
  readonly line: number;
  readonly side: DiffSide;
  readonly parentId?: string;
  readonly editing?: ReviewComment;
}

interface DiffRendererState {
  readonly comments: readonly ReviewComment[];
  readonly draft?: CommentDraft;
  readonly enabled: boolean;
  readonly currentUserId?: string;
}

type Annotation =
  | { kind: "thread"; comments: readonly ReviewCommentThreadEntry[] }
  | { kind: "editor"; draft: CommentDraft };

interface DiffRendererCallbacks {
  onSelect(draft: CommentDraft): void;
  onSave(draft: CommentDraft, text: string): Promise<void>;
  onCancel(): void;
}

/** Owns Pierre's imperative renderer and reconciles only structural annotation changes. */
export class DiffRendererController {
  readonly #renderer: FileDiff<Annotation>;
  #container?: HTMLDivElement;
  #state: DiffRendererState = { comments: [], enabled: false };

  constructor(
    readonly file: FileDiffMetadata,
    private readonly callbacks: DiffRendererCallbacks,
  ) {
    this.#renderer = new FileDiff<Annotation>({
      diffIndicators: "bars",
      lineHoverHighlight: "both",
      onLineClick: ({ lineNumber, annotationSide }) => {
        if (this.#state.enabled)
          this.callbacks.onSelect({ file: this.file.name, line: lineNumber, side: annotationSide });
      },
      renderAnnotation: (annotation) => this.#renderAnnotation(annotation.metadata),
      unsafeCSS: diffOverrides,
    });
  }

  mount(container: HTMLDivElement, state: DiffRendererState): void {
    this.#container = container;
    this.update(state);
  }

  update(state: DiffRendererState): void {
    this.#state = state;
    if (!this.#container) return;
    this.#renderer.render({
      fileDiff: this.file,
      containerWrapper: this.#container,
      lineAnnotations: this.#annotations(),
    });
  }

  dispose(): void {
    this.#renderer.cleanUp();
    this.#container = undefined;
  }

  #annotations(): DiffLineAnnotation<Annotation>[] {
    return [
      ...this.#threads().map((comments) => ({
        side: comments[0].comment.side,
        lineNumber: comments[0].comment.line,
        metadata: { kind: "thread" as const, comments },
      })),
      ...(this.#state.draft?.file === this.file.name
        ? [
            {
              side: this.#state.draft.side,
              lineNumber: this.#state.draft.line,
              metadata: { kind: "editor" as const, draft: this.#state.draft },
            },
          ]
        : []),
    ];
  }

  #threads(): ReviewCommentThreadEntry[][] {
    const comments = this.#state.comments.filter((comment) => comment.file === this.file.name);
    const byParent = new Map<string | null, ReviewComment[]>();
    const ids = new Set(comments.map((comment) => comment.id));
    for (const comment of comments) {
      const parent = comment.parentId && ids.has(comment.parentId) ? comment.parentId : null;
      byParent.set(parent, [...(byParent.get(parent) ?? []), comment]);
    }
    const collect = (comment: ReviewComment, depth: number): ReviewCommentThreadEntry[] => [
      { comment, depth },
      ...(byParent.get(comment.id) ?? []).flatMap((reply) => collect(reply, depth + 1)),
    ];
    return (byParent.get(null) ?? []).map((root) => collect(root, 0));
  }

  #renderAnnotation(annotation: Annotation): HTMLElement {
    const element = createReviewCommentAnnotation(
      annotation.kind === "thread"
        ? {
            kind: "thread",
            comments: annotation.comments,
            currentUserId: this.#state.currentUserId,
          }
        : {
            kind: "editor",
            initialValue: annotation.draft.editing?.comment ?? "",
            editing: Boolean(annotation.draft.editing),
          },
    );
    for (const eventName of ["click", "mousedown", "pointerdown"])
      element.addEventListener(eventName, (event) => event.stopPropagation());
    if (annotation.kind === "thread") {
      element.addEventListener(REVIEW_COMMENT_EDIT_EVENT, (event) => {
        const comment = (event as CustomEvent<ReviewComment>).detail;
        this.callbacks.onSelect({
          file: comment.file,
          line: comment.line,
          side: comment.side,
          editing: comment,
        });
      });
      element.addEventListener(REVIEW_COMMENT_REPLY_EVENT, (event) => {
        const comment = (event as CustomEvent<ReviewComment>).detail;
        this.callbacks.onSelect({
          file: comment.file,
          line: comment.line,
          side: comment.side,
          parentId: comment.id,
        });
      });
    } else {
      element.addEventListener(
        REVIEW_COMMENT_SAVE_EVENT,
        (event) => void this.callbacks.onSave(annotation.draft, (event as CustomEvent<string>).detail),
      );
      element.addEventListener(REVIEW_COMMENT_CANCEL_EVENT, this.callbacks.onCancel);
    }
    return element;
  }
}

const diffOverrides = `
[data-indicators="bars"] [data-line-type="change-deletion"][data-column-number]::before {
  background-image: none;
  background-color: var(--diffs-deletion-base);
}
`;
