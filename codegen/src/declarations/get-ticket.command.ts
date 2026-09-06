import { defineCommand, defineStruct } from "../model/declarations.ts";
import { Ticket, TicketId } from "./shared-types.ts";

export default defineCommand({
  id: "get-ticket",
  description: "Return one ticket by its stable identifier.",
  request: defineStruct({
    name: "GetTicketRequest",
    description: "The values required to retrieve a ticket.",
    fields: [{ name: "id", type: TicketId, description: "The ticket identifier to retrieve." }],
  }),
  response: Ticket,
});
