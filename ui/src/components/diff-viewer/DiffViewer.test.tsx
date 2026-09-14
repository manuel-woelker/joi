// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReviewComment } from "../../generated/api/api";
import { DiffViewer } from "./DiffViewer";
import { largePatch, multipleFilesPatch } from "./diff-fixtures";

describe("DiffViewer", () => {
  afterEach(cleanup);
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 560 });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 900 });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute("aria-label") === "Diff" ? 560 : 28;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 900 });
  });

  it("filters and selects files with the shared tree", async () => {
    render(() => <DiffViewer patch={multipleFilesPatch} virtualized={false} />);
    fireEvent.input(screen.getByPlaceholderText("Path..."), { target: { value: "status" } });
    expect(await screen.findByText("status.ts")).toBeTruthy();
    expect(screen.queryByText("review.ts")).toBeNull();
    expect(screen.queryByLabelText(/Comment on/)).toBeNull();
  });

  it("adds, edits, and replies using accessible controls", async () => {
    const user = userEvent.setup();
    let comments: ReviewComment[] = [];
    const save = vi.fn(async (request) => {
      const saved: ReviewComment = {
        ...request,
        id: request.id ?? `new-${comments.length}`,
        commitId: "demo",
        createdAt: "2026-01-02T00:00:00Z",
        authorId: "user",
        authorUsername: "jane",
      };
      comments = [...comments.filter((comment) => comment.id !== saved.id), saved];
      return saved;
    });
    render(() => (
      <DiffViewer
        patch={multipleFilesPatch}
        virtualized={false}
        comments={{ currentUserId: "user", commitId: "demo", load: async () => comments, save }}
      />
    ));
    await user.click(await screen.findByLabelText("Comment on new line 4"));
    fireEvent.input(await screen.findByLabelText("Comment"), { target: { value: "Review this" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: null, commitId: "demo" })));
    expect(await screen.findByText("Review this")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Edit comment"));
    const editor = screen.getByLabelText("Comment");
    expect(editor.closest("article")?.textContent).toContain("Save");
    fireEvent.input(editor, { target: { value: "Updated review" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: "new-0", comment: "Updated review" })),
    );
    fireEvent.click(screen.getByLabelText("Reply"));
    expect((screen.getByLabelText("Comment") as HTMLTextAreaElement).value).toBe("");
  });

  it("keeps the rendered virtual row count bounded", () => {
    const view = render(() => <DiffViewer patch={largePatch()} showDiagnostics />);
    expect(view.container.querySelectorAll("[data-row-id]").length).toBeLessThan(100);
  });
});
