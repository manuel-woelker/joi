export const multipleFilesPatch = [
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
  "--- /dev/null",
  "+++ b/src/status.ts",
  "@@ -0,0 +1,2 @@",
  "+export type ReviewStatus = 'open' | 'approved';",
  "+export const defaultStatus: ReviewStatus = 'open';",
  "diff --git a/src/review-options.ts b/src/review-options.ts",
  "index 23766ac..e81cd42 100644",
  "--- a/src/review-options.ts",
  "+++ b/src/review-options.ts",
  "@@ -1,6 +1,11 @@",
  " export interface ReviewOptions {",
  "-  includeDrafts: boolean;",
  "-  maxFiles: number;",
  "+  includeUncommitted: boolean;",
  "+  maximumFiles: number;",
  "+  contextLines: number;",
  " }",
  " ",
  "-export const defaults = { includeDrafts: false, maxFiles: 50 };",
  "+export const defaultReviewOptions = {",
  "+  includeUncommitted: true,",
  "+  maximumFiles: 100,",
  "+  contextLines: 3,",
  "+};",
].join("\n");

export const removedFilePatch = [
  "diff --git a/src/legacy.ts b/src/legacy.ts",
  "deleted file mode 100644",
  "--- a/src/legacy.ts",
  "+++ /dev/null",
  "@@ -1,3 +0,0 @@",
  "-export function legacy() {",
  "-  return true;",
  "-}",
].join("\n");

export const metadataPatch = [
  "diff --git a/docs/old name.md b/docs/new name.md",
  "similarity index 100%",
  "rename from docs/old name.md",
  "rename to docs/new name.md",
  "diff --git a/assets/logo.png b/assets/logo.png",
  "Binary files a/assets/logo.png and b/assets/logo.png differ",
  "diff --git a/script.sh b/script.sh",
  "old mode 100644",
  "new mode 100755",
].join("\n");

export const malformedPatch = [
  "diff --git a/a.ts b/a.ts",
  "--- a/a.ts",
  "+++ b/a.ts",
  "@@ -1,2 +1,2 @@",
  "-old",
  "+new",
].join("\n");

export function largePatch(fileCount = 20, linesPerFile = 500): string {
  const blocks: string[] = [];
  for (let file = 0; file < fileCount; file += 1) {
    blocks.push(
      `diff --git a/generated/file-${file}.ts b/generated/file-${file}.ts`,
      `--- a/generated/file-${file}.ts`,
      `+++ b/generated/file-${file}.ts`,
      `@@ -1,${linesPerFile} +1,${linesPerFile} @@`,
      ...Array.from(
        { length: linesPerFile },
        (_, line) => ` export const value${line} = ${file * linesPerFile + line};`,
      ),
    );
  }
  return blocks.join("\n");
}
