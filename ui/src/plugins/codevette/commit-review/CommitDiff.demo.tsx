import type { ComponentDemo } from "../../core/playground/demo";
import { CommitDiff } from "./CommitDiff";

const multiFilePatch = [
  "diff --git a/src/review.ts b/src/review.ts",
  "index 178d1ab..d752f6a 100644",
  "--- a/src/review.ts",
  "+++ b/src/review.ts",
  "@@ -1,7 +1,10 @@",
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
  "@@ -18,3 +18,4 @@ export class CommandService {",
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
      name: "No text changes",
      description: "Displays an empty state when a commit contains no renderable text changes.",
      render: () => <CommitDiff patch="" />,
    },
  ],
} satisfies ComponentDemo;
