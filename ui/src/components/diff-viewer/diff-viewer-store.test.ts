import { createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import type { ReviewComment } from "../../generated/api/api";
import { commentThreads } from "./comment-model";
import { createDiffViewerStore } from "./diff-viewer-store";
import { multipleFilesPatch } from "./diff-fixtures";
import { parsePatch } from "./patch-parser";

const comment: ReviewComment = {
  id: "one",
  commitId: "commit",
  createdAt: "2026-01-01T00:00:00Z",
  authorId: "user",
  authorUsername: "jane",
  parentId: null,
  file: "src/review.ts",
  line: 4,
  side: "additions",
  comment: "Original",
};

describe("DiffViewerStore", () => {
  it("loads, opens, and saves comments through explicit operations", async () =>
    createRoot(async (dispose) => {
      const save = vi.fn(async (request) => ({ ...comment, ...request, id: request.id ?? "two" }));
      const controller = createDiffViewerStore(parsePatch(multipleFilesPatch), {
        currentUserId: "user",
        load: async () => [comment],
        save,
      });
      await controller.load();
      controller.openCommentEdit("one");
      await controller.saveComment("Changed");
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: "one", comment: "Changed" }));
      expect(controller.state.comments[0].comment).toBe("Changed");
      expect(controller.state.editor).toBeUndefined();
      dispose();
    }));

  it("retains the editor and exposes failures", async () =>
    createRoot(async (dispose) => {
      const controller = createDiffViewerStore(parsePatch(multipleFilesPatch), {
        currentUserId: "user",
        load: async () => [],
        save: async () => {
          throw new Error("Nope");
        },
      });
      controller.openCommentEditor({ file: "src/review.ts", line: 4, side: "additions" });
      await expect(controller.saveComment("Draft")).rejects.toThrow("Nope");
      expect(controller.state.editor).toBeDefined();
      expect(controller.state.error).toBe("Nope");
      dispose();
    }));
});

describe("commentThreads", () => {
  it("orders replies and promotes orphans", () => {
    const reply = { ...comment, id: "reply", parentId: "one", createdAt: "2026-01-02T00:00:00Z" };
    const orphan = { ...comment, id: "orphan", parentId: "missing", createdAt: "2026-01-03T00:00:00Z" };
    expect(
      commentThreads([orphan, reply, comment]).map((thread) => thread.map((entry) => [entry.comment.id, entry.depth])),
    ).toEqual([
      [
        ["one", 0],
        ["reply", 1],
      ],
      [["orphan", 0]],
    ]);
  });
});
