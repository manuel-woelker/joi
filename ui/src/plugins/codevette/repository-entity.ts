import GitPullRequestIcon from "lucide-solid/icons/git-pull-request";

import { defineEntity, entityId } from "../core/entities/entity-description";
import { generateKsuid } from "../core/entities/ksuid";

/** Canonical UI description of repositories configured for code review. */
export const repositoryEntity = defineEntity({
  id: entityId("repositories"),
  tableName: "repositories",
  label: "Repository",
  pluralLabel: "Repositories",
  icon: GitPullRequestIcon,
  identityAttribute: "id",
  attributes: [
    {
      id: "id",
      label: "ID",
      description: "Immutable repository identifier.",
      valueType: "string",
      create: { hidden: true, initialValue: generateKsuid },
    },
    {
      id: "key",
      label: "Key",
      description: "Stable short key identifying the repository.",
      valueType: "string",
      table: { visibleByDefault: true, width: 140 },
      edit: { control: "text", required: true, placeholder: "joi" },
      create: { required: true, placeholder: "joi" },
    },
    {
      id: "name",
      label: "Name",
      description: "Human-readable repository name.",
      valueType: "string",
      table: { visibleByDefault: true },
      edit: { control: "text", required: true, placeholder: "Joi" },
      create: { required: true, placeholder: "Joi" },
    },
    {
      id: "path",
      label: "Path",
      description: "Local filesystem path to the repository.",
      valueType: "string",
      table: { visibleByDefault: true },
      edit: { control: "text", required: true, placeholder: "/path/to/repository" },
      create: { required: true, placeholder: "/path/to/repository" },
    },
  ],
});
