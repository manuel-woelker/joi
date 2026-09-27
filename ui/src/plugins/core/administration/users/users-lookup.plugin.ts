import { lookupDefinitions, lookupEntryId, lookupId } from "../../lookups/lookup";
import { plugin } from "../../../../base/plugin-registry";
import { fetchServiceKey } from "../../../../base/services/fetch-service";
import { loadUsers } from "./users-api";
import { userEntity } from "./user-entity";
import { entityRowLabel } from "../../entities/entity-label";

export default plugin({
  name: "user-lookup",
  description: "User display-name lookup",
  requires: { fetchService: fetchServiceKey },
  registerExtensions(context) {
    context.registerExtension({
      point: lookupDefinitions,
      id: "users-by-id",
      description: "Resolves user IDs to names",
      value: {
        id: lookupId("users"),
        label: "User",
        sourceTableName: "users",
        async load() {
          const result = await loadUsers(context.services.fetchService);
          const id = result.requireColumn("id");
          return result.rows.map((row) => ({
            id: lookupEntryId(String(row.value(id))),
            label: entityRowLabel(userEntity, result, row),
          }));
        },
      },
    });
  },
});
