// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

import { GitHistory, relativeTime, shortCommitId } from "./GitHistory";
import type { GitHistorySource } from "./git-history";

describe("GitHistory", () => {
  it("loads additional parent commits", async () => {
    const loadCommits = vi
      .fn<GitHistorySource["loadCommits"]>()
      .mockImplementation(async ({ cursor }) =>
        cursor
          ? { commits: [commit("parent", [], "Parent commit")] }
          : { commits: [commit("child", ["parent"], "Child commit\nDetails")], nextCursor: "page-2" },
      );

    render(() => <GitHistory source={{ loadCommits }} now={() => new Date("2026-09-13T12:00:00Z")} />);
    expect(await screen.findByText("Child commit")).toBeTruthy();
    expect(screen.getByText("Details")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load older commits" }));

    expect(await screen.findByText("Parent commit")).toBeTruthy();
    await waitFor(() => expect(loadCommits).toHaveBeenLastCalledWith({ cursor: "page-2", limit: 50 }));
  });

  it("reports source failures in the component", async () => {
    render(() => <GitHistory source={{ loadCommits: async () => Promise.reject(new Error("offline")) }} />);

    expect(await screen.findByText("Could not load commit history: offline")).toBeTruthy();
  });
});

function commit(id: string, parentIds: string[], message: string) {
  return { id, parentIds, message, author: "Jane Developer", authoredAt: "2026-09-13T10:00:00Z" };
}

describe("Git history formatting", () => {
  it("formats short IDs and relative dates", () => {
    expect(shortCommitId("1234567890abcdef")).toBe("12345678");
    expect(relativeTime("2026-09-13T10:00:00Z", new Date("2026-09-13T12:00:00Z"))).toBe("2 hours ago");
  });
});
