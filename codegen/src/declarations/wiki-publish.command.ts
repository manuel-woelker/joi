import { defineCommand, defineStruct, stringType } from "../engine/model/declarations.ts";

export default defineCommand({
  id: "wiki-publish",
  description: "Publishes a saved wiki draft and removes it.",
  requiredHandler: false,
  request: defineStruct({
    name: "WikiPublishRequest",
    description: "The page whose saved draft should be published.",
    fields: [{ name: "id", type: stringType, description: "Published wiki page ID." }],
  }),
  response: defineStruct({
    name: "WikiPublishResponse",
    description: "Published wiki content used to update the open page.",
    fields: [
      { name: "title", type: stringType, description: "Published title." },
      { name: "content", type: stringType, description: "Published rich-text content." },
    ],
  }),
});
