import FolderKanbanIcon from "lucide-solid/icons/folder-kanban";

import { matches } from "../../../validation/validation-functions";
import { defineEntity, entityId } from "../../core/entities/entity-description";
import { generateKsuid } from "../../core/entities/ksuid";

const projectPrefix = /^(?:|[A-Z][A-Z0-9]*)$/;

/** Canonical UI description of ticket projects. */
export const projectEntity = defineEntity({
  id: entityId("projects"),
  tableName: "projects",
  label: "Project",
  pluralLabel: "Projects",
  icon: FolderKanbanIcon,
  identityAttribute: "id",
  attributes: [
    {
      id: "id",
      label: "ID",
      description: "Immutable project identifier.",
      valueType: "string",
      create: { hidden: true, initialValue: generateKsuid },
    },
    {
      id: "name",
      label: "Name",
      description: "Human-readable project name.",
      valueType: "string",
      table: { visibleByDefault: true },
      edit: { control: "text", required: true },
      create: { required: true },
    },
    {
      id: "prefix",
      label: "Prefix",
      description: "Uppercase prefix used for ticket keys.",
      valueType: "string",
      table: { visibleByDefault: true, width: 120 },
      edit: { control: "text", required: true, placeholder: "PROJECT" },
      create: { required: true, placeholder: "PROJECT" },
      validation: matches(projectPrefix, "Use uppercase letters and numbers, starting with a letter."),
    },
    {
      id: "description",
      label: "Description",
      description: "Purpose and scope of the project.",
      valueType: "string",
      table: { visibleByDefault: true },
      edit: { control: "textarea", required: true, rows: 8 },
      create: { required: true, rows: 8 },
    },
  ],
});
