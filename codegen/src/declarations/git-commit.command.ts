import {
  defineCommand,
  defineEnum,
  defineStruct,
  integerType,
  list,
  stringType,
} from "../engine/model/declarations.ts";

export const CommitStatus = defineEnum({
  name: "CommitStatus",
  description: "Current review workflow state of a commit.",
  values: [
    { name: "open", description: "Review has not been requested." },
    { name: "review-requested", description: "Review has been requested." },
    { name: "in-review", description: "Review is in progress." },
    { name: "reworking", description: "Author is addressing review feedback." },
    { name: "approved", description: "Commit is approved." },
  ],
});

export const GitCommitDetails = defineStruct({
  name: "GitCommitDetails",
  description: "Commit metadata, cached change summary, and text-file patch.",
  fields: [
    { name: "id", type: stringType, description: "Full hexadecimal Git object ID." },
    { name: "parentIds", type: list(stringType), description: "Parent commit IDs in Git order." },
    { name: "message", type: stringType, description: "Complete commit message." },
    { name: "author", type: stringType, description: "Commit author display name." },
    { name: "authoredAt", type: stringType, description: "Author timestamp in RFC 3339 format." },
    { name: "filesChanged", type: integerType, description: "Number of changed text files." },
    { name: "linesAdded", type: integerType, description: "Number of added text lines." },
    { name: "linesDeleted", type: integerType, description: "Number of deleted text lines." },
    { name: "status", type: CommitStatus, description: "Current review workflow state." },
    { name: "patch", type: stringType, description: "Unified patch containing text changes only." },
  ],
});

export default defineCommand({
  id: "codevette-commit",
  description: "Loads review details and the text patch for one Git commit.",
  requiredHandler: false,
  request: defineStruct({
    name: "GitCommitRequest",
    description: "Identifies a commit in a configured branch.",
    fields: [
      { name: "branchId", type: stringType, description: "Configured repository branch ID." },
      { name: "commitId", type: stringType, description: "Full Git commit object ID." },
    ],
  }),
  response: GitCommitDetails,
});
