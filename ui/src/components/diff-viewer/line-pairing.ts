import { diffRowId, type DiffHunk, type DiffLine, type DiffRowId } from "./diff-model";

export interface PairedDiffLine {
  readonly id: DiffRowId;
  readonly deletion?: DiffLine;
  readonly addition?: DiffLine;
}

/** Pairs contiguous deletion/addition runs without claiming semantic equivalence. */
export function pairHunkLines(hunk: DiffHunk): readonly PairedDiffLine[] {
  const result: PairedDiffLine[] = [];
  for (let index = 0; index < hunk.lines.length; ) {
    const line = hunk.lines[index];
    if (line.kind === "context") {
      result.push({ id: diffRowId(`${line.id}:pair`), deletion: line, addition: line });
      index += 1;
      continue;
    }
    const deletions: DiffLine[] = [];
    const additions: DiffLine[] = [];
    while (index < hunk.lines.length && hunk.lines[index].kind !== "context") {
      const changed = hunk.lines[index++];
      (changed.kind === "deletion" ? deletions : additions).push(changed);
    }
    for (let offset = 0; offset < Math.max(deletions.length, additions.length); offset += 1) {
      result.push({
        id: diffRowId(`${hunk.id}:pair:${result.length}`),
        deletion: deletions[offset],
        addition: additions[offset],
      });
    }
  }
  return result;
}
