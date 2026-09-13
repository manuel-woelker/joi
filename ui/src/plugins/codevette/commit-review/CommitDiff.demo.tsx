import type { ComponentDemo } from "../../core/playground/demo";
import type { ReviewComment, ReviewCommentSaveRequest } from "../../../generated/api/api";
import { CommitDiff, type ReviewCommentSource } from "./CommitDiff";

const multiFilePatch = [
  "diff --git a/src/review.ts b/src/review.ts",
  "index 178d1ab..d752f6a 100644",
  "--- a/src/review.ts",
  "+++ b/src/review.ts",
  "@@ -1,5 +1,8 @@",
  " import type { Commit } from './commit';",
  " ",
  "-export function review(commit: Commit) {",
  "-  return commit.message;",
  "+export function review(commit: Commit): ReviewSummary {",
  "+  return {",
  "+    subject: commit.message.split('\\n', 1)[0],",
  "+    changedFiles: commit.files.length,",
  "+  };",
  " }",
  "diff --git a/src/status.ts b/src/status.ts",
  "new file mode 100644",
  "index 0000000..c823c8a",
  "--- /dev/null",
  "+++ b/src/status.ts",
  "@@ -0,0 +1,5 @@",
  "+export type ReviewStatus =",
  "+  | 'open'",
  "+  | 'review-requested'",
  "+  | 'in-review'",
  "+  | 'approved';",
  "",
].join("\n");

const widePatch = [
  "diff --git a/src/generated/command-service.ts b/src/generated/command-service.ts",
  "index 2a355bd..42e9ac7 100644",
  "--- a/src/generated/command-service.ts",
  "+++ b/src/generated/command-service.ts",
  "@@ -18,2 +18,3 @@ export class CommandService {",
  "   constructor(private readonly fetchService: FetchService) {}",
  "+  readonly loadCommit = (request: GitCommitRequest) => this.fetchService.execute<GitCommitDetails>('codevette-commit', request);",
  " }",
  "",
].join("\n");

const removedFilePatch = [
  "diff --git a/src/legacy-review.ts b/src/legacy-review.ts",
  "deleted file mode 100644",
  "index 9f88031..0000000",
  "--- a/src/legacy-review.ts",
  "+++ /dev/null",
  "@@ -1,8 +0,0 @@",
  "-import type { Commit } from './commit';",
  "-",
  "-export function legacyReview(commit: Commit) {",
  "-  return {",
  "-    id: commit.id,",
  "-    message: commit.message,",
  "-  };",
  "-}",
  "",
].join("\n");

function constrainedDiff(patch: string) {
  return () => (
    <div style={{ width: "620px", "max-width": "100%", height: "360px", overflow: "auto" }}>
      <CommitDiff patch={patch} />
    </div>
  );
}

function CommentedDiff() {
  let comments: ReviewComment[] = [
    {
      id: "comment-1",
      commitId: "demo-commit",
      createdAt: "2026-09-13T12:00:00Z",
      authorId: "user-1",
      authorUsername: "jane",
      parentId: null,
      file: "src/review.ts",
      line: 4,
      side: "additions",
      comment: "Could this return a named summary type?",
    },
    {
      id: "comment-2",
      commitId: "demo-commit",
      createdAt: "2026-09-13T12:08:00Z",
      authorId: "user-2",
      authorUsername: "joe",
      parentId: "comment-1",
      file: "src/review.ts",
      line: 4,
      side: "additions",
      comment: "Agreed. It will also make this easier to extend.",
    },
  ];
  const source: ReviewCommentSource = {
    currentUserId: "user-1",
    async load() {
      return comments;
    },
    async save(request: ReviewCommentSaveRequest) {
      const saved: ReviewComment = {
        id: request.id ?? `comment-${comments.length + 1}`,
        commitId: "demo-commit",
        createdAt: request.id
          ? (comments.find((item) => item.id === request.id)?.createdAt ?? "2026-09-13T12:00:00Z")
          : new Date().toISOString(),
        authorId: "user-1",
        authorUsername: "jane",
        parentId: request.parentId,
        file: request.file,
        line: request.line,
        side: request.side,
        comment: request.comment,
      };
      comments = [...comments.filter((item) => item.id !== saved.id), saved];
      return saved;
    },
  };
  return (
    <div style={{ width: "720px", "max-width": "100%", height: "440px", overflow: "auto" }}>
      <CommitDiff patch={multiFilePatch} comments={source} />
    </div>
  );
}

export default {
  name: "Commit Diff",
  description: "Text-file patches rendered with file headers, line numbers, and syntax highlighting.",
  scenarios: [
    {
      name: "Multiple files",
      description: "Displays modified and newly created files from one commit patch.",
      render: constrainedDiff(multiFilePatch),
    },
    {
      name: "Long lines",
      description: "Keeps a wide source line readable through horizontal diff scrolling.",
      render: constrainedDiff(widePatch),
    },
    {
      name: "Removed file",
      description: "Displays a deleted file with its complete contents as removed lines.",
      render: constrainedDiff(removedFilePatch),
    },
    {
      name: "Line comments",
      description: "Click a source line to add a comment, or edit the seeded comment as its author.",
      render: CommentedDiff,
    },
    {
      name: "No text changes",
      description: "Displays an empty state when a commit contains no renderable text changes.",
      render: () => <CommitDiff patch="" />,
    },
  ],
} satisfies ComponentDemo;
