import TicketIcon from "lucide-solid/icons/ticket";
import { lookupId } from "../../core/lookups/lookup";
import { defineEntity, entityId } from "../../core/entities/entity-description";
import { generateKsuid } from "../../core/entities/ksuid";

const ticketKey = /^(?:|[A-Z][A-Z0-9]*-[1-9][0-9]*)$/;

/** Canonical UI description of ticket records. */
export const ticketEntity = defineEntity({
  id: entityId("tickets"),
  tableName: "tickets",
  label: "Ticket",
  pluralLabel: "Tickets",
  icon: TicketIcon,
  identityAttribute: "id",
  attributes: [
    {
      id: "id",
      label: "ID",
      description: "Immutable ticket identifier.",
      valueType: "string",
      create: { hidden: true, initialValue: generateKsuid },
    },
    {
      id: "key",
      label: "Key",
      description: "Human-readable project-prefixed ticket key.",
      valueType: "string",
      table: { visibleByDefault: true, width: 100 },
      create: { control: "text", required: true, placeholder: "PROJECT-1" },
      validation: ({ value, addValidationFailure }) => {
        if (!ticketKey.test(value)) addValidationFailure({ message: "Use a key such as PROJECT-1." });
      },
    },
    {
      id: "project_id",
      label: "Project",
      description: "Project that owns the ticket.",
      valueType: "string",
      lookup: lookupId("projects"),
      facet: true,
      table: { visibleByDefault: true, width: 140 },
      edit: { control: "lookup", required: true },
      create: { control: "lookup", required: true },
    },
    {
      id: "title",
      label: "Title",
      description: "Short summary of the issue or task.",
      valueType: "string",
      table: { visibleByDefault: true, width: 260 },
      edit: { control: "text", required: true },
      create: { required: true },
    },
    {
      id: "status",
      label: "Status",
      description: "Current workflow state of the ticket.",
      valueType: "string",
      facet: true,
      table: { visibleByDefault: true, width: 120 },
      create: { hidden: true, initialValue: "open" },
    },
    {
      id: "assignee",
      label: "Assignee",
      description: "User currently responsible for the ticket.",
      valueType: "string",
      lookup: lookupId("users"),
      facet: true,
      optional: true,
      table: { visibleByDefault: true, width: 160 },
      edit: { control: "lookup" },
      create: { control: "lookup" },
    },
    {
      id: "description",
      label: "Description",
      description: "Detailed issue or task description.",
      valueType: "string",
      table: { visibleByDefault: true },
      edit: { control: "html" },
      create: {},
    },
  ],
});
