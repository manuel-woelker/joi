import { booleanType, defineCommand, defineStruct, stringType } from "../engine/model/declarations.ts";

export default defineCommand({
  id: "entity-key-resolve",
  description: "Resolves a human-readable namespace:key alias to an entity type and ID.",
  request: defineStruct({
    name: "EntityKeyResolveRequest",
    description: "A human-readable entity alias.",
    fields: [
      { name: "namespace", type: stringType, description: "Alias namespace, such as wiki." },
      { name: "key", type: stringType, description: "Human-readable key in that namespace." },
    ],
  }),
  response: defineStruct({
    name: "EntityKeyResolveResponse",
    description: "The canonical entity target, when the alias exists.",
    fields: [
      { name: "found", type: booleanType, description: "Whether this alias exists." },
      { name: "entity_type", type: stringType, description: "Canonical entity type, or empty when absent." },
      { name: "entity_id", type: stringType, description: "Canonical entity ID, or empty when absent." },
    ],
  }),
});
