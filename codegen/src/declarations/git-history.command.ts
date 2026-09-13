import { defineCommand, defineStruct, integerType, list, optional, stringType } from "../engine/model/declarations.ts";

export const GitCommit = defineStruct({
  name: "GitCommit",
  description: "A Git commit and the parent relationships needed to render its history graph.",
  fields: [
    { name: "id", type: stringType, description: "Full hexadecimal object ID." },
    { name: "parentIds", type: list(stringType), description: "Parent commit IDs in Git order." },
    { name: "message", type: stringType, description: "Complete commit message." },
    { name: "author", type: stringType, description: "Commit author display name." },
    { name: "authoredAt", type: stringType, description: "Author timestamp in RFC 3339 format." },
  ],
});

export const GitHistoryResponse = defineStruct({
  name: "GitHistoryResponse",
  description: "One page of branch history and an opaque cursor for older commits.",
  fields: [
    { name: "commits", type: list(GitCommit), description: "Commits ordered newest first." },
    {
      name: "nextCursor",
      type: optional(stringType),
      description: "Cursor for the next page, or null at history end.",
    },
  ],
});

export default defineCommand({
  id: "codevette-history",
  description: "Loads a page of Git commit history for a configured branch.",
  requiredHandler: false,
  request: defineStruct({
    name: "GitHistoryRequest",
    description: "Identifies a configured branch and the requested history page.",
    fields: [
      { name: "branchId", type: stringType, description: "Configured repository branch ID." },
      { name: "cursor", type: optional(stringType), description: "Opaque cursor returned by a previous page." },
      { name: "limit", type: integerType, description: "Maximum number of commits to return." },
    ],
  }),
  response: GitHistoryResponse,
});
