import type { ReviewComment } from "../../generated/api/api";
import { commentLocation, commentThreads, type CommentThreadEntry } from "./comment-model";
import type { CommentEditor } from "./diff-viewer-store";
import {
  diffRowId,
  locationKey,
  type DiffDocument,
  type DiffFile,
  type DiffFileId,
  type DiffLocation,
  type DiffRowId,
} from "./diff-model";
import { pairHunkLines, type PairedDiffLine } from "./line-pairing";

export type VirtualDiffRow =
  | { readonly id: DiffRowId; readonly kind: "file"; readonly file: DiffFile }
  | { readonly id: DiffRowId; readonly kind: "info"; readonly file: DiffFile }
  | { readonly id: DiffRowId; readonly kind: "hunk"; readonly header: string }
  | {
      readonly id: DiffRowId;
      readonly kind: "code";
      readonly file: DiffFile;
      readonly pairs: readonly PairedDiffLine[];
    }
  | { readonly id: DiffRowId; readonly kind: "thread"; readonly entries: readonly CommentThreadEntry[] }
  | { readonly id: DiffRowId; readonly kind: "editor"; readonly editor: CommentEditor };

export function flattenDiffRows(
  document: DiffDocument,
  fileIds: readonly DiffFileId[],
  comments: readonly ReviewComment[],
  editor?: CommentEditor,
): readonly VirtualDiffRow[] {
  const byLocation = new Map<string, ReviewComment[]>();
  for (const comment of comments) {
    const key = locationKey(commentLocation(comment));
    byLocation.set(key, [...(byLocation.get(key) ?? []), comment]);
  }
  const rows: VirtualDiffRow[] = [];
  for (const fileId of fileIds) {
    const file = document.filesById.get(fileId);
    if (!file) continue;
    rows.push({ id: diffRowId(`${file.id}:file`), kind: "file", file });
    if (!file.hunks.length) rows.push({ id: diffRowId(`${file.id}:info`), kind: "info", file });
    for (const hunk of file.hunks) {
      rows.push({ id: hunk.id, kind: "hunk", header: hunk.header });
      const pairs = pairHunkLines(hunk);
      for (let pairIndex = 0; pairIndex < pairs.length; pairIndex += 1) {
        const pair = pairs[pairIndex];
        const missingSide = hasAnnotations(file, pair, byLocation, editor) ? undefined : missingSideFor(pair);
        const group = [pair];
        while (
          missingSide &&
          pairIndex + 1 < pairs.length &&
          missingSideFor(pairs[pairIndex + 1]) === missingSide &&
          !hasAnnotations(file, pairs[pairIndex + 1], byLocation, editor)
        ) {
          group.push(pairs[++pairIndex]);
        }
        rows.push({ id: pair.id, kind: "code", file, pairs: group });
        for (const location of pairLocations(file, pair)) {
          const located = byLocation.get(locationKey(location)) ?? [];
          if (located.length)
            rows.push({
              id: diffRowId(`${pair.id}:thread:${location.side}`),
              kind: "thread",
              entries: commentThreads(located).flat(),
            });
          if (editor && locationKey(editor.location) === locationKey(location)) {
            rows.push({ id: diffRowId(`${pair.id}:editor:${location.side}`), kind: "editor", editor });
          }
        }
      }
    }
  }
  return rows;
}

function missingSideFor(pair: PairedDiffLine): "additions" | "deletions" | undefined {
  if (!pair.addition) return "additions";
  if (!pair.deletion) return "deletions";
  return undefined;
}

function hasAnnotations(
  file: DiffFile,
  pair: PairedDiffLine,
  comments: ReadonlyMap<string, readonly ReviewComment[]>,
  editor: CommentEditor | undefined,
): boolean {
  return pairLocations(file, pair).some(
    (location) =>
      comments.has(locationKey(location)) ||
      (editor !== undefined && locationKey(editor.location) === locationKey(location)),
  );
}

function pairLocations(file: DiffFile, pair: PairedDiffLine): DiffLocation[] {
  const result: DiffLocation[] = [];
  if (pair.deletion?.oldLine) result.push({ file: file.displayPath, line: pair.deletion.oldLine, side: "deletions" });
  if (pair.addition?.newLine) result.push({ file: file.displayPath, line: pair.addition.newLine, side: "additions" });
  return result;
}
