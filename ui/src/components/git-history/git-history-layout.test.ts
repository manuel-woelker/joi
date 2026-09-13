import { describe, expect, it } from "vitest";

import type { GitHistoryCommit } from "./git-history";
import { layoutGitHistory } from "./git-history-layout";

const commit = (id: string, parentIds: string[]): GitHistoryCommit => ({
  id,
  parentIds,
  message: id,
  author: "Author",
  authoredAt: "2026-09-13T12:00:00Z",
});

describe("layoutGitHistory", () => {
  it("keeps linear history in one lane", () => {
    const rows = layoutGitHistory([commit("c", ["b"]), commit("b", ["a"]), commit("a", [])]);

    expect(rows.map((row) => row.lane)).toEqual([0, 0, 0]);
    expect(rows.map((row) => row.laneCount)).toEqual([1, 1, 1]);
  });

  it("creates parent lanes for merge commits", () => {
    const rows = layoutGitHistory([
      commit("merge", ["left", "right"]),
      commit("left", ["base"]),
      commit("right", ["base"]),
      commit("base", []),
    ]);

    expect(rows[0].lines).toHaveLength(2);
    expect(rows[1].laneCount).toBe(2);
    expect(rows[2].lane).toBe(1);
    expect(rows[0].lines.filter((line) => line.from === "commit").map((line) => line.color)).toEqual([0, 1]);
    expect(rows[1].lines.find((line) => line.from === "commit")?.color).toBe(0);
    expect(rows[2].lines.find((line) => line.from === "commit")?.color).toBe(1);
  });
});
