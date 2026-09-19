import type { ReviewComment } from "../../generated/api/api";
import { type CommentThreadEntry, commentLocation, commentThreads } from "./comment-model";
import {
  type DiffDocument,
  type DiffFile,
  type DiffFileId,
  type DiffLocation,
  type DiffRowId,
  diffRowId,
  locationKey,
} from "./diff-model";
import type { CommentEditor } from "./diff-viewer-store";
import { type PairedDiffLine, pairHunkLines } from "./line-pairing";

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
        const missingSide = missingSideFor(pair);
        const group = [pair];
        // Split runs around annotated lines so threads and editors land on
        // the exact line; unannotated runs stay joined for one continuous
        // placeholder.
        if (!hasAnnotations(file, pair, byLocation, editor)) {
          while (
            missingSide &&
            pairIndex + 1 < pairs.length &&
            missingSideFor(pairs[pairIndex + 1]) === missingSide &&
            !hasAnnotations(file, pairs[pairIndex + 1], byLocation, editor)
          ) {
            group.push(pairs[++pairIndex]);
          }
        }
        rows.push({ id: pair.id, kind: "code", file, pairs: group });
        for (const groupedPair of group) {
          for (const location of pairLocations(file, groupedPair)) {
            const located = byLocation.get(locationKey(location)) ?? [];
            if (located.length)
              rows.push({
                id: diffRowId(`${groupedPair.id}:thread:${location.side}`),
                kind: "thread",
                entries: commentThreads(located).flat(),
              });
            if (editor?.kind === "new" && locationKey(editor.location) === locationKey(location)) {
              rows.push({ id: diffRowId(`${groupedPair.id}:editor:${location.side}`), kind: "editor", editor });
            }
          }
        }
      }
    }
  }
  return rows;
}

/** Keeps comment threads and a small amount of code context around their locations. */
export function flattenCommentRows(
  document: DiffDocument,
  fileIds: readonly DiffFileId[],
  comments: readonly ReviewComment[],
  editor?: CommentEditor,
  contextLines = 3,
): readonly VirtualDiffRow[] {
  const rows = flattenDiffRows(document, fileIds, comments, editor);
  const fileAt = new Map<number, number>();
  const hunkAt = new Map<number, number>();
  const codeByHunk = new Map<string, number[]>();
  let fileIndex = -1;
  let hunkIndex = -1;

  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].kind === "file") {
      fileIndex = index;
      hunkIndex = -1;
    } else if (rows[index].kind === "hunk") hunkIndex = index;
    fileAt.set(index, fileIndex);
    hunkAt.set(index, hunkIndex);
    if (rows[index].kind === "code") {
      const key = `${fileIndex}:${hunkIndex}`;
      codeByHunk.set(key, [...(codeByHunk.get(key) ?? []), index]);
    }
  }

  const kept = new Set<number>();
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].kind !== "thread" && rows[index].kind !== "editor") continue;
    let codeIndex = index - 1;
    while (codeIndex >= 0 && rows[codeIndex].kind !== "code" && rows[codeIndex].kind !== "file") codeIndex -= 1;
    if (codeIndex < 0 || rows[codeIndex].kind !== "code") continue;
    const context = codeByHunk.get(`${fileAt.get(codeIndex)}:${hunkAt.get(codeIndex)}`) ?? [];
    const position = context.indexOf(codeIndex);
    for (const contextIndex of context.slice(Math.max(0, position - contextLines), position + contextLines + 1)) {
      kept.add(contextIndex);
    }
    kept.add(index);
  }

  for (const index of [...kept]) {
    const containingFile = fileAt.get(index);
    const containingHunk = hunkAt.get(index);
    if (containingFile !== undefined && containingFile >= 0) kept.add(containingFile);
    if (containingHunk !== undefined && containingHunk >= 0) kept.add(containingHunk);
  }
  return rows.filter((_, index) => kept.has(index));
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
      (editor?.kind === "new" && locationKey(editor.location) === locationKey(location)),
  );
}

function pairLocations(file: DiffFile, pair: PairedDiffLine): DiffLocation[] {
  const result: DiffLocation[] = [];
  if (pair.deletion?.oldLine) result.push({ file: file.displayPath, line: pair.deletion.oldLine, side: "deletions" });
  if (pair.addition?.newLine) result.push({ file: file.displayPath, line: pair.addition.newLine, side: "additions" });
  return result;
}
