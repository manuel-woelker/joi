/** Opaque continuation token supplied and interpreted by a Git history backend. */
export type GitHistoryCursor = string;

/** A commit rendered in a branch history, ordered newest first. */
export interface GitHistoryCommit {
  readonly id: string;
  readonly parentIds: readonly string[];
  readonly message: string;
  readonly author: string;
  readonly authoredAt: string;
}

/** One page of commits and the token for fetching older parents. */
export interface GitHistoryPage {
  readonly commits: readonly GitHistoryCommit[];
  readonly nextCursor?: GitHistoryCursor;
}

/** Backend-neutral asynchronous access to a branch's commit ancestry. */
export interface GitHistorySource {
  loadCommits(request: { readonly cursor?: GitHistoryCursor; readonly limit: number }): Promise<GitHistoryPage>;
}
