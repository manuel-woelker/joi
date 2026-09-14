import type { ReviewComment, ReviewCommentSaveRequest } from "../../generated/api/api";
import type { DiffLocation } from "./diff-model";

export interface ReviewCommentSource {
  readonly currentUserId: string;
  readonly commitId: string;
  load(): Promise<readonly ReviewComment[]>;
  save(request: ReviewCommentSaveRequest): Promise<ReviewComment>;
}

export interface CommentThreadEntry {
  readonly comment: ReviewComment;
  readonly depth: number;
}

/** Builds deterministic threads, promoting orphaned and cyclic replies to roots. */
export function commentThreads(comments: readonly ReviewComment[]): readonly (readonly CommentThreadEntry[])[] {
  const ordered = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const ids = new Set(ordered.map((comment) => comment.id));
  const children = new Map<string | null, ReviewComment[]>();
  for (const comment of ordered) {
    const parent = comment.parentId && ids.has(comment.parentId) ? comment.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), comment]);
  }
  const visited = new Set<string>();
  const collect = (root: ReviewComment) => {
    const entries: CommentThreadEntry[] = [];
    const visit = (comment: ReviewComment, depth: number, path: ReadonlySet<string>) => {
      if (path.has(comment.id) || visited.has(comment.id)) return;
      visited.add(comment.id);
      entries.push({ comment, depth });
      const nextPath = new Set(path).add(comment.id);
      for (const child of children.get(comment.id) ?? []) visit(child, depth + 1, nextPath);
    };
    visit(root, 0, new Set());
    return entries;
  };
  const threads = (children.get(null) ?? []).map(collect);
  for (const comment of ordered) if (!visited.has(comment.id)) threads.push(collect(comment));
  return threads;
}

export const commentLocation = (comment: ReviewComment): DiffLocation => ({
  file: comment.file,
  line: comment.line,
  side: comment.side,
});
