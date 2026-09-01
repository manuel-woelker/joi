import TicketIcon from "lucide-solid/icons/ticket";
import { lookupId } from "../lookups/lookup";
import { defineEntity } from "./entity-description";
import { generateKsuid } from "./ksuid";

const ticketKey = /^(?:|[A-Z][A-Z0-9]*-[1-9][0-9]*)$/;

/** Canonical UI description of ticket records. */
export const ticketEntity = defineEntity({
  id: "tickets",
  tableName: "tickets",
  label: "Ticket",
  pluralLabel: "Tickets",
  icon: TicketIcon,
  identityAttribute: "id",
  attributes: [
    { id: "id", label: "ID", valueType: "string", create: { hidden: true, initialValue: generateKsuid } },
    {
      id: "key",
      label: "Key",
      valueType: "string",
      table: { visibleByDefault: true, width: 100 },
      create: { control: "text", required: true, placeholder: "PROJECT-1" },
      validation: ({ value, addValidationFailure }) => {
        if (!ticketKey.test(value)) addValidationFailure({ message: "Use a key such as PROJECT-1." });
      },
    },
    {
      id: "title",
      label: "Title",
      valueType: "string",
      table: { visibleByDefault: true },
      edit: { control: "text", required: true },
      create: { required: true },
    },
    {
      id: "status",
      label: "Status",
      valueType: "string",
      table: { visibleByDefault: true, width: 120 },
      create: { hidden: true, initialValue: "open" },
    },
    {
      id: "description",
      label: "Description",
      valueType: "string",
      table: { visibleByDefault: true },
      edit: { control: "textarea", rows: 10 },
      create: { rows: 10 },
    },
    {
      id: "assignee",
      label: "Assignee",
      valueType: "string",
      lookup: lookupId("users"),
      optional: true,
      table: { visibleByDefault: true, width: 160 },
      edit: { control: "lookup" },
      create: { control: "lookup" },
    },
  ],
});
