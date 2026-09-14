import type { ComponentDemo } from "../../plugins/core/playground/demo";
import type { ReviewComment, ReviewCommentSaveRequest } from "../../generated/api/api";
import type { ReviewCommentSource } from "./comment-model";
import { DiffViewer } from "./DiffViewer";
import { largePatch, malformedPatch, metadataPatch, multipleFilesPatch, removedFilePatch } from "./diff-fixtures";

const longLinePatch = multipleFilesPatch.replace(
  "+    changedFiles: commit.files.length,",
  `+    changedFiles: commit.files.filter((file) => file.path.startsWith("src/components/very-long-directory-name/")).length,`,
);

function demo(patch: string, comments?: ReviewCommentSource, showDiagnostics = false) {
  return () => <DiffViewer patch={patch} comments={comments} height={460} showDiagnostics={showDiagnostics} />;
}

function commentSource(): ReviewCommentSource {
  let comments: ReviewComment[] = [
    {
      id: "comment-1",
      commitId: "demo",
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
      commitId: "demo",
      createdAt: "2026-09-13T12:08:00Z",
      authorId: "user-2",
      authorUsername: "joe",
      parentId: "comment-1",
      file: "src/review.ts",
      line: 4,
      side: "additions",
      comment: "Agreed. That also makes future fields explicit.",
    },
    {
      id: "comment-3",
      commitId: "demo",
      createdAt: "2026-09-13T12:10:00Z",
      authorId: "user-1",
      authorUsername: "jane",
      parentId: "comment-2",
      file: "src/review.ts",
      line: 4,
      side: "additions",
      comment: "I will extract it in this change.",
    },
  ];
  return {
    currentUserId: "user-1",
    async load() {
      return comments;
    },
    async save(request: ReviewCommentSaveRequest) {
      const previous = comments.find((comment) => comment.id === request.id);
      const saved: ReviewComment = {
        ...request,
        id: request.id ?? `comment-${comments.length + 1}`,
        commitId: "demo",
        createdAt: previous?.createdAt ?? new Date().toISOString(),
        authorId: "user-1",
        authorUsername: "jane",
      };
      comments = [...comments.filter((comment) => comment.id !== saved.id), saved];
      return saved;
    },
  };
}

export default {
  name: "Diff Viewer",
  description: "Virtualized SolidJS patch rendering with file navigation and inline review threads.",
  scenarios: [
    {
      name: "Multiple files",
      description: "Modified and added files in a side-by-side layout.",
      render: demo(multipleFilesPatch),
    },
    {
      name: "Long lines",
      description: "Long source lines scroll without moving the file tree.",
      render: demo(longLinePatch),
    },
    {
      name: "Removed file",
      description: "A complete deleted file with symmetric removal indicators.",
      render: demo(removedFilePatch),
    },
    {
      name: "Comments",
      description: "Add comments from line gutters, then edit or reply from icon actions.",
      render: demo(multipleFilesPatch, commentSource()),
    },
    {
      name: "Git metadata",
      description: "Renames, binary files, paths with spaces, and mode-only changes.",
      render: demo(metadataPatch),
    },
    {
      name: "Quick filtering",
      description: "Filter the file tree and visible patch by path tokens.",
      render: demo(multipleFilesPatch),
    },
    { name: "Empty patch", description: "A clear empty state when no text changes exist.", render: demo("") },
    {
      name: "Malformed patch",
      description: "Malformed hunk counts produce an explicit parse error.",
      render: demo(malformedPatch),
    },
    {
      name: "10,000 rows",
      description: "Twenty files prove that the rendered DOM remains bounded.",
      render: demo(largePatch(), undefined, true),
    },
  ],
} satisfies ComponentDemo;
