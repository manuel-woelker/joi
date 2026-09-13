import type { GitHistoryCommit } from "./git-history";

export interface GitHistoryGraphLine {
  readonly fromLane: number;
  readonly toLane: number;
  readonly color: number;
  readonly from: "top" | "commit";
  readonly to: "commit" | "bottom";
}

export interface GitHistoryGraphRow {
  readonly lane: number;
  readonly color: number;
  readonly laneCount: number;
  readonly lines: readonly GitHistoryGraphLine[];
}

/** Assigns stable visual lanes to commits and their parent connections. */
export function layoutGitHistory(commits: readonly GitHistoryCommit[]): GitHistoryGraphRow[] {
  let lanes: string[] = [];
  const colors = new Map<string, number>();
  let nextColor = 0;
  const newColor = () => nextColor++;
  const colorFor = (id: string) => {
    const existing = colors.get(id);
    if (existing !== undefined) return existing;
    const color = newColor();
    colors.set(id, color);
    return color;
  };

  return commits.map((commit) => {
    let lane = lanes.indexOf(commit.id);
    const hasIncomingTrack = lane >= 0;
    if (lane < 0) {
      lane = 0;
      lanes.unshift(commit.id);
    }
    const before = [...lanes];
    const after = [...lanes];
    after.splice(lane, 1);
    const commitColor = colorFor(commit.id);
    commit.parentIds.forEach((id, parentIndex) => {
      if (!after.includes(id)) after.splice(Math.min(lane + parentIndex, after.length), 0, id);
      if (!colors.has(id)) colors.set(id, parentIndex === 0 ? commitColor : newColor());
    });

    const lines: GitHistoryGraphLine[] = hasIncomingTrack
      ? [{ fromLane: lane, toLane: lane, color: commitColor, from: "top", to: "commit" }]
      : [];
    before.forEach((id, fromLane) => {
      if (id === commit.id) return;
      const toLane = after.indexOf(id);
      if (toLane >= 0) lines.push({ fromLane, toLane, color: colorFor(id), from: "top", to: "bottom" });
    });
    commit.parentIds.forEach((id, parentIndex) => {
      const toLane = after.indexOf(id);
      if (toLane >= 0) {
        lines.push({
          fromLane: lane,
          toLane,
          color: parentIndex === 0 ? commitColor : colorFor(id),
          from: "commit",
          to: "bottom",
        });
      }
    });
    const row = {
      lane,
      color: commitColor,
      laneCount: Math.max(before.length, after.length, 1),
      lines,
    };
    lanes = after;
    return row;
  });
}
