import UsersIcon from "lucide-solid/icons/users";
import { matches } from "../../../../validation/validation-functions";
import { defineEntity, entityId } from "../../entities/entity-description";
import { generateKsuid } from "../../entities/ksuid";

/** Canonical UI description of user records. */
export const userEntity = defineEntity({
  id: entityId("users"),
  tableName: "users",
  label: "User",
  pluralLabel: "Users",
  icon: UsersIcon,
  identityAttribute: "id",
  attributes: [
    {
      id: "id",
      label: "ID",
      description: "Immutable user identifier.",
      valueType: "string",
      create: { hidden: true, initialValue: generateKsuid },
    },
    {
      id: "username",
      label: "Username",
      description: "Unique name used to identify the user.",
      valueType: "string",
      table: { visibleByDefault: true },
      edit: { control: "text", required: true },
      create: { required: true },
    },
    {
      id: "name",
      label: "Name",
      description: "Display name shown throughout the application.",
      valueType: "string",
      table: { visibleByDefault: true },
      edit: { control: "text", required: true },
      create: { required: true },
      validation: matches(
        /^(?:|[\p{L}\p{M} .'\u2018\u2019-]+)$/u,
        "Use only letters, spaces, periods, apostrophes, and hyphens.",
      ),
    },
  ],
});
