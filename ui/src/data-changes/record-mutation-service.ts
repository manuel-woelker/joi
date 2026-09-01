import type { MasterDetailDefinition } from "../master-detail/definition";
import { updateRecord, type RecordFieldValue } from "../master-detail/record-api";
import { serviceKey } from "../plugins/services";
import type { QueryValue } from "../query/query-result";
import type { FetchService } from "../services/fetch-service";
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
    const key = `${definition.tableName}\0${recordId}`;
    const previous = this.pending.get(key) ?? Promise.resolve();
    const operation = previous
      .catch(() => undefined)
      .then(async () => {
        const fields = toFieldValues(definition, changes);
        if (fields.length === 0) return;
        await updateRecord(this.fetchService, definition, recordId, fields);
        this.dataChanges.publish({
          tableName: definition.tableName,
          recordId,
          changes: Object.freeze({ ...changes }),
          source,
        });
      });
    this.pending.set(key, operation);
    void operation.then(
      () => {
        if (this.pending.get(key) === operation) this.pending.delete(key);
      },
      () => {
        if (this.pending.get(key) === operation) this.pending.delete(key);
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
