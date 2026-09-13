import { defineCommand, defineStruct, stringType } from "../engine/model/declarations.ts";
import { ReviewCommentsResponse } from "./review-comments.command.ts";

export default defineCommand({
  id: "codevette-review-comments",
  description: "Lists review comments for one commit.",
  requiredHandler: false,
  request: defineStruct({
    name: "ReviewCommentsRequest",
    description: "Identifies the reviewed commit.",
    fields: [{ name: "commitId", type: stringType, description: "Reviewed commit object ID." }],
  }),
  response: ReviewCommentsResponse,
});
