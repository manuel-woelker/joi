import { defineEntity } from "./entity-description";

/** Canonical UI description of ticket records. */
export const ticketEntity = defineEntity({
  id: "tickets",
  tableName: "tickets",
  label: "Ticket",
  pluralLabel: "Tickets",
  identityAttribute: "id",
  attributes: [
    { id: "id", label: "ID", valueType: "string" },
    { id: "key", label: "Key", valueType: "string", table: { visibleByDefault: true, width: 100 } },
    {
      id: "title",
      label: "Title",
      valueType: "string",
      table: { visibleByDefault: true },
      edit: { control: "text", required: true },
    },
    {
      id: "status",
      label: "Status",
      valueType: "string",
      table: { visibleByDefault: true, width: 120 },
    },
    {
      id: "description",
      label: "Description",
      valueType: "string",
      table: { visibleByDefault: true },
      edit: { control: "textarea", rows: 10 },
    },
  ],
});
