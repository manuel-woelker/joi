import { plugin } from "../../../base/plugin-registry";
import { fetchServiceKey } from "../../../base/services/fetch-service";
import { administrationContributions } from "../../core/administration/contribution";
import { entityDescriptions } from "../../core/entities/entity-registry";
import { lookupDefinitions, lookupEntryId } from "../../core/lookups/lookup";
import { EntityMasterDetailView } from "../../core/master-detail/EntityMasterDetailView";
import { loadEntityRecords } from "../../core/saved-views/entity-query";
import { projectEntity } from "./project-entity";
import { projectLookupId } from "./project-lookup";

export default plugin({
  name: "ticket-projects",
  description: "Ticket project administration and lookup",
  requires: { fetchService: fetchServiceKey },
  registerExtensions(context) {
    context.registerExtension({
      point: entityDescriptions,
      id: "project-entity",
      description: "Defines ticket projects",
      value: projectEntity,
    });
    context.registerExtension({
      point: lookupDefinitions,
      id: "projects-by-id",
      description: "Resolves project IDs to names",
      value: {
        id: projectLookupId,
        label: "Project",
        sourceTableName: projectEntity.tableName,
        async load() {
          const result = await loadEntityRecords(projectEntity, context.services.fetchService);
          const id = result.requireColumn("id");
          const name = result.requireColumn("name");
          const prefix = result.requireColumn("prefix");
          return result.rows.map((row) => ({
            id: lookupEntryId(String(row.value(id))),
            label: `${String(row.value(name))} (${String(row.value(prefix))})`,
          }));
        },
      },
    });
    context.registerExtension({
      point: administrationContributions,
      id: "projects",
      description: "Creates and edits ticket projects",
      value: {
        id: "projects",
        name: "Projects",
        section: "Administration",
        icon: projectEntity.icon,
        content: () => <EntityMasterDetailView entityId={projectEntity.id} />,
      },
    });
  },
});
