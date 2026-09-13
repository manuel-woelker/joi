import {
  defineCommand,
  defineEnum,
  defineStruct,
  integerType,
  list,
  optional,
  stringType,
} from "../engine/model/declarations.ts";

export const DiffSide = defineEnum({
  name: "DiffSide",
  description: "The old or new side of a file diff.",
  values: [
    { name: "additions", description: "The file contents after the commit." },
    { name: "deletions", description: "The file contents before the commit." },
  ],
});

export const ReviewComment = defineStruct({
  name: "ReviewComment",
  description: "A single-line commit review comment or reply.",
  fields: [
    { name: "id", type: stringType, description: "Immutable KSUID comment identifier." },
    { name: "commitId", type: stringType, description: "Reviewed commit object ID." },
    { name: "createdAt", type: stringType, description: "Creation timestamp in RFC 3339 format." },
    { name: "authorId", type: stringType, description: "Comment author user ID." },
    { name: "authorUsername", type: stringType, description: "Comment author username." },
    { name: "parentId", type: optional(stringType), description: "Parent comment ID for replies." },
    { name: "file", type: stringType, description: "Repository-relative file path." },
    { name: "line", type: integerType, description: "One-based line number." },
    { name: "side", type: DiffSide, description: "Diff side containing the line." },
    { name: "comment", type: stringType, description: "Comment text." },
  ],
});

export const ReviewCommentsResponse = defineStruct({
  name: "ReviewCommentsResponse",
  description: "Comments attached to one commit.",
  fields: [{ name: "comments", type: list(ReviewComment), description: "Comments in creation order." }],
});

export const ReviewCommentSaveRequest = defineStruct({
  name: "ReviewCommentSaveRequest",
  description: "Creates a comment or edits one owned by the current user.",
  fields: [
    { name: "id", type: optional(stringType), description: "Existing comment ID when editing." },
    { name: "commitId", type: stringType, description: "Reviewed commit object ID." },
    { name: "parentId", type: optional(stringType), description: "Parent comment ID for a reply." },
    { name: "file", type: stringType, description: "Repository-relative file path." },
    { name: "line", type: integerType, description: "One-based line number." },
    { name: "side", type: DiffSide, description: "Diff side containing the line." },
    { name: "comment", type: stringType, description: "Non-empty comment text." },
  ],
});

export default defineCommand({
  id: "codevette-review-comment-save",
  description: "Creates or edits a single-line review comment.",
  requiredHandler: false,
  request: ReviewCommentSaveRequest,
  response: ReviewComment,
});
