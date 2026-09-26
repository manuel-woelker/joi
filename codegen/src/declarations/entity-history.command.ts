import {
  booleanType,
  defineCommand,
  defineEnum,
  defineStruct,
  integerType,
  jsonType,
  list,
  optional,
  stringType,
} from "../engine/model/declarations.ts";

export const HistoryOperation = defineEnum({
  name: "HistoryOperation",
  description: "An actual entity state transition.",
  values: ["Create", "Update", "Delete"].map((name) => ({ name, description: `${name} an entity.` })),
});
export const HistoryChange = defineStruct({
  name: "HistoryChange",
  description: "A changed attribute; absent values differ from present JSON null.",
  fields: [
    { name: "key", type: stringType, description: "Attribute key." },
    {
      name: "oldValue",
      type: optional(jsonType),
      description: "Previous value, omitted when the attribute did not exist.",
    },
    { name: "newValue", type: optional(jsonType), description: "Final value, omitted when the attribute was removed." },
  ],
});
export const HistoryEntry = defineStruct({
  name: "HistoryEntry",
  description: "A durable audit entry committed with an entity change.",
  fields: [
    { name: "id", type: stringType, description: "History KSUID." },
    { name: "userid", type: stringType, description: "User ID, or system for server-generated changes." },
    { name: "timestamp", type: stringType, description: "UTC RFC 3339 timestamp." },
    { name: "entityId", type: stringType, description: "Entity identity." },
    { name: "type", type: HistoryOperation, description: "Actual operation." },
    { name: "changes", type: list(HistoryChange), description: "Changes in attribute-key order." },
  ],
});
export default defineCommand({
  id: "entity-history",
  description: "Read one page of entity history in descending KSUID order.",
  request: defineStruct({
    name: "EntityHistoryRequest",
    description: "Bounded history lookup, including deleted entities.",
    fields: [
      { name: "table", type: stringType, description: "Entity table." },
      { name: "entityId", type: stringType, description: "Entity identity." },
      { name: "limit", type: optional(integerType), description: "Page size, default 50, capped at 200." },
      { name: "cursor", type: optional(stringType), description: "Exclusive history KSUID cursor." },
    ],
  }),
  response: defineStruct({
    name: "EntityHistoryResponse",
    description: "A bounded history page.",
    fields: [
      { name: "enabled", type: booleanType, description: "Whether history is enabled for this table." },
      {
        name: "entries",
        type: list(HistoryEntry),
        description: "Entries in descending key order, approximately chronological.",
      },
      { name: "nextCursor", type: optional(stringType), description: "Cursor for the next page, or null." },
    ],
  }),
});
