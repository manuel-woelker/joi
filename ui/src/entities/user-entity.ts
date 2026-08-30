import { matches } from "../validation/validation-functions";
import { defineEntity } from "./entity-description";

/** Canonical UI description of user records. */
export const userEntity = defineEntity({
  id: "users",
  tableName: "users",
  label: "User",
  pluralLabel: "Users",
  identityAttribute: "id",
  attributes: [
    { id: "id", label: "ID", valueType: "string" },
    {
      id: "username",
      label: "Username",
      valueType: "string",
      table: { visibleByDefault: true },
      edit: { control: "text", required: true },
    },
    {
      id: "name",
      label: "Name",
      valueType: "string",
      table: { visibleByDefault: true },
      edit: { control: "text", required: true },
      validation: matches(
        /^(?:|[\p{L}\p{M} .'\u2018\u2019-]+)$/u,
        "Use only letters, spaces, periods, apostrophes, and hyphens.",
      ),
    },
  ],
});
