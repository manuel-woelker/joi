import { defineCommand, defineStruct, integerType, jsonType, list, stringType } from "../engine/model/declarations.ts";

export const QueryColumnValues = defineStruct({
  name: "QueryColumnValues",
  description: "A typed column of values returned by a query.",
  fields: [
    { name: "type", type: stringType, description: "The data type shared by the column values." },
    { name: "values", type: list(jsonType), description: "The values in row order." },
  ],
});

export const QueryResultColumn = defineStruct({
  name: "QueryResultColumn",
  description: "One named result column and its values.",
  fields: [
    { name: "attribute", type: stringType, description: "The queried attribute name." },
    { name: "values", type: QueryColumnValues, description: "The values returned for the attribute." },
  ],
});

export const QueryResponse = defineStruct({
  name: "QueryResponse",
  description: "The column-oriented result of querying a table.",
  fields: [
    { name: "numberOfHits", type: integerType, description: "The total number of matching rows." },
    { name: "resultColumns", type: list(QueryResultColumn), description: "The requested result columns." },
  ],
});

export default defineCommand({
  id: "query",
  description: "Query records from a registered data table.",
  request: defineStruct({
    name: "QueryRequest",
    description: "The table, filtering, limit, and attributes for a query.",
    fields: [
      { name: "tableName", type: stringType, description: "The table to query." },
      { name: "criterion", type: jsonType, description: "The recursive query criterion." },
      { name: "maxResults", type: integerType, description: "The maximum number of rows to return." },
      { name: "attributes", type: list(stringType), description: "The attributes to return, or `*` for all." },
    ],
  }),
  response: QueryResponse,
});
