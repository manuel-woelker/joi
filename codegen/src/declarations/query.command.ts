import {
  defineCommand,
  defineEnum,
  defineStruct,
  booleanType,
  integerType,
  jsonType,
  list,
  optional,
  stringType,
} from "../engine/model/declarations.ts";

export const QuerySortDirection = defineEnum({
  name: "QuerySortDirection",
  description: "Direction used to order values from one query attribute.",
  values: [
    { name: "ascending", description: "Orders lower values before higher values." },
    { name: "descending", description: "Orders higher values before lower values." },
  ],
});

export const QuerySort = defineStruct({
  name: "QuerySort",
  description: "One attribute and direction in a query's ordered sort sequence.",
  fields: [
    { name: "attribute", type: stringType, description: "The attribute used for sorting." },
    { name: "direction", type: QuerySortDirection, description: "The direction used for this attribute." },
  ],
});

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
    {
      name: "numberOfHits",
      type: optional(integerType),
      description: "The total number of matching rows when requested.",
    },
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
      { name: "sorting", type: list(QuerySort), description: "Sort criteria applied in priority order." },
      { name: "maxResults", type: integerType, description: "The maximum number of rows to return." },
      { name: "attributes", type: list(stringType), description: "The attributes to return, or `*` for all." },
      {
        name: "returnTotalCount",
        type: booleanType,
        description: "Whether to include the total number of matching rows in the response.",
      },
    ],
  }),
  response: QueryResponse,
});
