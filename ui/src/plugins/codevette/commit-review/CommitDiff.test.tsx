// @vitest-environment happy-dom

import { cleanup, fireEvent, render, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewComment, ReviewCommentSaveRequest } from "../../../generated/api/api";
import { CommitDiff, type ReviewCommentSource } from "./CommitDiff";
import { REVIEW_COMMENT_EDIT_EVENT } from "./ReviewCommentAnnotation";

const patch = [
  "diff --git a/review.ts b/review.ts",
  "index 1111111..2222222 100644",
  "--- a/review.ts",
  "+++ b/review.ts",
  "@@ -1 +1 @@",
  "-return oldValue;",
  "+return newValue;",
  "",
].join("\n");

const comment: ReviewComment = {
  id: "comment-1",
  commitId: "commit-1",
  createdAt: "2026-09-13T12:00:00Z",
  authorId: "user-1",
  authorUsername: "jane",
  parentId: null,
  file: "review.ts",
  line: 1,
  side: "additions",
  comment: "Use the new value.",
};

afterEach(cleanup);

describe("CommitDiff", () => {
  it("opens the local editor from a comment's pen button", async () => {
    const source: ReviewCommentSource = {
      currentUserId: "user-1",
      async load() {
        return [comment];
      },
      async save() {
        return comment;
      },
    };
    const view = render(() => <CommitDiff patch={patch} comments={source} />);

    await waitFor(() => {
      expect(view.container.querySelector("joi-review-comment")).toBeTruthy();
    });
    const annotation = view.container.querySelector<HTMLElement>("joi-review-comment") as HTMLElement;
    let editEmitted = false;
    annotation?.addEventListener(REVIEW_COMMENT_EDIT_EVENT, () => {
      editEmitted = true;
    });
    const edit = annotation?.shadowRoot?.querySelector<HTMLButtonElement>('button[aria-label="Edit comment"]');
    expect(edit).toBeTruthy();
    fireEvent.click(edit as HTMLButtonElement);
    expect(editEmitted).toBe(true);

    await waitFor(() => {
      const editor = [...view.container.querySelectorAll<HTMLElement>("joi-review-comment")]
        .find((item) => item.shadowRoot?.querySelector("textarea"))
        ?.shadowRoot?.querySelector("textarea");
      expect(editor).toBeTruthy();
      expect((editor as HTMLTextAreaElement).value).toBe(comment.comment);
    });
  });

  it("saves a reply with the selected comment as its parent", async () => {
    const save = vi.fn(async (_request: ReviewCommentSaveRequest) => ({
      ...comment,
      id: "comment-2",
      parentId: comment.id,
      comment: "Reply",
    }));
    const source: ReviewCommentSource = {
      currentUserId: "user-1",
      async load() {
        return [comment];
      },
      save,
    };
    const view = render(() => <CommitDiff patch={patch} comments={source} />);
    await waitFor(() => {
      expect(view.container.querySelector("joi-review-comment")).toBeTruthy();
    });
    const annotation = view.container.querySelector<HTMLElement>("joi-review-comment") as HTMLElement;
    const reply = annotation?.shadowRoot?.querySelector<HTMLButtonElement>('button[aria-label="Reply to comment"]');
    fireEvent.click(reply as HTMLButtonElement);

    await waitFor(() => {
      expect(
        [...view.container.querySelectorAll<HTMLElement>("joi-review-comment")].find((item) =>
          item.shadowRoot?.querySelector("textarea"),
        ),
      ).toBeTruthy();
    });
    const editor = [...view.container.querySelectorAll<HTMLElement>("joi-review-comment")].find((item) =>
      item.shadowRoot?.querySelector("textarea"),
    ) as HTMLElement;
    const textarea = editor?.shadowRoot?.querySelector("textarea") as HTMLTextAreaElement;
    textarea.value = "Reply";
    fireEvent.input(textarea);
    fireEvent.click(editor?.shadowRoot?.querySelector("button.primary") as HTMLButtonElement);

    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]?.[0]).toMatchObject({ parentId: comment.id, comment: "Reply" });
  });
});
