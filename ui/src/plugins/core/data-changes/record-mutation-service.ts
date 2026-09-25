import type { MasterDetailDefinition } from "../master-detail/definition";
import { updateRecords, type RecordFieldValue } from "../master-detail/record-api";
import { serviceKey } from "../../../base/service-registry";
import type { QueryValue } from "../query/query-result";
import type { FetchService } from "../../../base/services/fetch-service";
import type { DataChangeService } from "./data-change-service";

/** Serializes record writes and publishes only changes committed by the backend. */
export class RecordMutationService {
  private readonly pending = new Map<string, Promise<void>>();

  constructor(
    private readonly fetchService: FetchService,
    private readonly dataChanges: DataChangeService,
  ) {}

  update(
    definition: MasterDetailDefinition,
    recordId: string,
    changes: Readonly<Record<string, QueryValue>>,
    source?: string,
  ): Promise<void> {
    return this.updateMany(definition, [{ recordId, changes }], source);
  }

  updateMany(
    definition: MasterDetailDefinition,
    updates: readonly { readonly recordId: string; readonly changes: Readonly<Record<string, QueryValue>> }[],
    source?: string,
  ): Promise<void> {
    const prepared = updates
      .map(({ recordId, changes }) => ({ recordId, changes, fields: toFieldValues(definition, changes) }))
      .filter(({ fields }) => fields.length > 0);
    if (!prepared.length) return Promise.resolve();
    const keys = prepared.map(({ recordId }) => `${definition.tableName}\0${recordId}`);
    if (new Set(keys).size !== keys.length) throw new Error("A record may only be updated once per batch");
    const previous = keys.map((key) => this.pending.get(key)).filter((pending): pending is Promise<void> => !!pending);
    const operation = Promise.all(previous.map((pending) => pending.catch(() => undefined))).then(async () => {
      await updateRecords(
        this.fetchService,
        definition,
        prepared.map(({ recordId, fields }) => ({ id: recordId, fields })),
      );
      for (const { recordId, changes } of prepared) {
        this.dataChanges.publish({
          tableName: definition.tableName,
          recordId,
          changes: Object.freeze({ ...changes }),
          source,
        });
      }
    });
    for (const key of keys) this.pending.set(key, operation);
    void operation.then(
      () => {
        for (const key of keys) if (this.pending.get(key) === operation) this.pending.delete(key);
      },
      () => {
        for (const key of keys) if (this.pending.get(key) === operation) this.pending.delete(key);
      },
    );
    return operation;
  }
}

function toFieldValues(
  definition: MasterDetailDefinition,
  changes: Readonly<Record<string, QueryValue>>,
): RecordFieldValue[] {
  return Object.entries(changes).map(([attribute, value]) => {
    const field = definition.fields.find((candidate) => candidate.attribute === attribute);
    if (!field) throw new Error(`Entity table '${definition.tableName}' has no editable field '${attribute}'`);
    return { field, value };
  });
}

export const recordMutationServiceKey = serviceKey<RecordMutationService>("record-mutation-service");
