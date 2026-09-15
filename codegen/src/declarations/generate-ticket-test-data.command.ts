import { defineCommand, defineStruct, integerType } from "../engine/model/declarations.ts";

export default defineCommand({
  id: "generate-ticket-test-data",
  description: "Generates additional ticket records for development and performance testing.",
  requiredHandler: false,
  request: defineStruct({
    name: "GenerateTicketTestDataRequest",
    description: "Controls how many additional ticket records to generate.",
    fields: [{ name: "count", type: integerType, description: "Number of tickets to generate." }],
  }),
  response: defineStruct({
    name: "GenerateTicketTestDataResponse",
    description: "Reports the number of generated ticket records.",
    fields: [{ name: "generated", type: integerType, description: "Number of tickets generated." }],
  }),
});
