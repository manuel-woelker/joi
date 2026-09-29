import { type Accessor, createEffect, createResource, onCleanup } from "solid-js";
import type { FetchService } from "../../../base/services/fetch-service";
import { CommandService } from "../../../generated/api/command-service";
import type { DataChangeService } from "../data-changes/data-change-service";
import type { EntityRegistry } from "../entities/entity-registry";
import { reconcileRecordResult } from "../entity-editor/record-editor-store";
import { executeDataQuery } from "../query/query-client";
import { resolveEntityReference } from "./entity-reference";

/** Loads only the requested record and reconciles committed changes without refreshing the form. */
export function createEntityPageStore(
  reference: Accessor<string>,
  dependencies: {
    readonly models: EntityRegistry;
    readonly fetchService: FetchService;
    readonly dataChanges: Pick<DataChangeService, "subscribe">;
  },
) {
  const [page, { refetch }] = createResource(reference, async (reference) => {
    let resolved = reference;
    if (reference.startsWith(":")) {
      const alias = reference.slice(1);
      const separator = alias.indexOf(":");
      if (separator <= 0 || separator === alias.length - 1) {
        throw new Error("Entity aliases must have the form #:namespace:key.");
      }
      const target = await new CommandService(dependencies.fetchService).entityKeyResolve({
        namespace: alias.slice(0, separator),
        key: alias.slice(separator + 1),
      });
      if (!target.found) throw new Error(`Entity alias '${alias}' was not found.`);
      resolved = `${target.entityType}:${target.entityId}`;
    }
    const { entity, attribute, key } = resolveEntityReference(resolved, dependencies.models);
    const result = await executeDataQuery(dependencies.fetchService, {
      tableName: entity.tableName,
      criterion: { equals: { attribute, values: [key] } },
      attributes: ["*"],
      sorting: [],
      maxResults: 2,
    });
    if (result.rows.length > 1) throw new Error(`Entity link '${reference}' matches multiple records.`);
    const row = result.rows[0];
    const recordId = row?.value(result.requireColumn(entity.identityAttribute));
    if (row && (typeof recordId !== "string" || !recordId))
      throw new Error("Entity response has an invalid identifier.");
    return { entity, result, recordId: typeof recordId === "string" ? recordId : undefined };
  });
  createEffect(() => {
    if (page.loading || page.error) return;
    const current = page();
    if (!current?.recordId) return;
    onCleanup(
      dependencies.dataChanges.subscribe(
        { tableName: current.entity.tableName, recordId: current.recordId },
        (change) => {
          reconcileRecordResult(current.result, current.entity.identityAttribute, change.recordId, change.changes);
        },
      ),
    );
  });
  return { page, retry: () => void refetch() };
}
