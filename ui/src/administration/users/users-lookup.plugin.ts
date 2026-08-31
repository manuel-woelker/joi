import { lookupDefinitions, lookupEntryId, lookupId } from "../../lookups/lookup";
import { plugin } from "../../plugins/registry";
import { fetchServiceKey } from "../../services/fetch-service";
import { loadUsers } from "./users-api";

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
        async load() {
          const result = await loadUsers(context.services.fetchService);
          const id = result.requireColumn("id");
          const name = result.requireColumn("name");
          return result.rows.map((row) => ({
            id: lookupEntryId(String(row.value(id))),
            label: String(row.value(name)),
          }));
        },
      },
    });
  },
});
