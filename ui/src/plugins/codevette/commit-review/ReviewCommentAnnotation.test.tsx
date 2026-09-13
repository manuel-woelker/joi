// @vitest-environment happy-dom

import { fireEvent } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewComment } from "../../../generated/api/api";
import {
  createReviewCommentAnnotation,
  REVIEW_COMMENT_EDIT_EVENT,
  REVIEW_COMMENT_REPLY_EVENT,
  REVIEW_COMMENT_SAVE_EVENT,
} from "./ReviewCommentAnnotation";

const comment: ReviewComment = {
  id: "comment-1",
  commitId: "commit-1",
  createdAt: "2026-09-13T12:00:00Z",
  authorId: "user-1",
  authorUsername: "jane",
  parentId: null,
  file: "src/review.ts",
  line: 4,
  side: "additions",
  comment: "Use a named summary type.",
};

afterEach(() => document.body.replaceChildren());

describe("ReviewCommentAnnotation", () => {
  it("emits edit from the pen button", () => {
    const annotation = createReviewCommentAnnotation({
      kind: "thread",
      comments: [{ comment, depth: 0 }],
      currentUserId: "user-1",
    });
    const edit = vi.fn();
    annotation.addEventListener(REVIEW_COMMENT_EDIT_EVENT, edit);
    document.body.append(annotation);

    const button = annotation.shadowRoot?.querySelector<HTMLButtonElement>('button[aria-label="Edit comment"]');
    expect(button?.querySelector(".lucide-pencil")).toBeTruthy();
    fireEvent.click(button as HTMLButtonElement);

    expect(edit).toHaveBeenCalledOnce();
  });

  it("emits the selected comment when replying", () => {
    const annotation = createReviewCommentAnnotation({
      kind: "thread",
      comments: [{ comment, depth: 0 }],
      currentUserId: "user-2",
    });
    const reply = vi.fn();
    annotation.addEventListener(REVIEW_COMMENT_REPLY_EVENT, reply);
    document.body.append(annotation);

    const button = annotation.shadowRoot?.querySelector<HTMLButtonElement>('button[aria-label="Reply to comment"]');
    fireEvent.click(button as HTMLButtonElement);

    expect((reply.mock.calls[0]?.[0] as CustomEvent<ReviewComment>).detail).toBe(comment);
  });

  it("keeps typed text local until save", () => {
    const annotation = createReviewCommentAnnotation({ kind: "editor", initialValue: comment.comment, editing: true });
    const save = vi.fn();
    annotation.addEventListener(REVIEW_COMMENT_SAVE_EVENT, save);
    document.body.append(annotation);
    const root = annotation.shadowRoot as ShadowRoot;
    const textarea = root.querySelector("textarea") as HTMLTextAreaElement;

    textarea.value = "Updated comment";
    fireEvent.input(textarea);
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(root.querySelector("button.primary") as HTMLButtonElement);

    expect(save.mock.calls[0]?.[0]).toMatchObject({ detail: "Updated comment" });
  });
});
