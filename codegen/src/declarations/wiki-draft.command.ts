import { booleanType, defineCommand, defineStruct, stringType } from "../engine/model/declarations.ts";

export const WikiDraftResponse = defineStruct({
  name: "WikiDraftResponse",
  description: "The current draft for one published wiki page, when present.",
  fields: [
    { name: "exists", type: booleanType, description: "Whether the page has unpublished edits." },
    { name: "id", type: stringType, description: "Published page and draft identifier." },
    { name: "title", type: stringType, description: "Draft title, or empty when absent." },
    { name: "content", type: stringType, description: "Draft rich-text content, or empty when absent." },
  ],
});

export default defineCommand({
  id: "wiki-draft",
  description: "Reads or opens the shared draft for a published wiki page.",
  requiredHandler: false,
  request: defineStruct({
    name: "WikiDraftRequest",
    description: "A page ID and whether to create a draft from its published state.",
    fields: [
      { name: "id", type: stringType, description: "Published wiki page ID." },
      { name: "create", type: booleanType, description: "Create the draft if none exists." },
    ],
  }),
  response: WikiDraftResponse,
});
