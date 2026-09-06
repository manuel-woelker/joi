import { defineAlias, defineEnum, defineStruct, list, optional, stringType } from "../model/declarations.ts";

export const TicketId = defineAlias({
  name: "TicketId",
  description: "The stable identifier of a ticket.",
  type: stringType,
});

export const TicketStatus = defineEnum({
  name: "TicketStatus",
  description: "The workflow state of a ticket.",
  values: [
    { name: "open", description: "The ticket is ready for work." },
    { name: "in-progress", description: "Work on the ticket has started." },
    { name: "closed", description: "The ticket no longer needs work." },
  ],
});

export const Ticket = defineStruct({
  name: "Ticket",
  description: "A bug, task, or issue tracked by the application.",
  fields: [
    { name: "id", type: TicketId, description: "The stable ticket identifier." },
    { name: "title", type: stringType, description: "The short ticket title." },
    { name: "status", type: TicketStatus, description: "The current workflow state." },
    { name: "tags", type: list(stringType), description: "Labels attached to the ticket." },
    { name: "assignee", type: optional(stringType), description: "The assigned user ID, when assigned." },
  ],
});
