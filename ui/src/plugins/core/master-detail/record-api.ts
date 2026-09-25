import type { QueryValue } from "../query/query-result";
import type { FetchService } from "../../../base/services/fetch-service";
import type { CreateRecordDefinition, EditFieldDefinition, MasterDetailDefinition } from "./definition";

export interface RecordFieldValue {
  readonly field: EditFieldDefinition;
  readonly value: QueryValue;
}

export interface RecordUpdate {
  readonly id: string;
  readonly fields: readonly RecordFieldValue[];
}

export async function createRecord(
  service: FetchService,
  definition: MasterDetailDefinition,
  values: Readonly<Record<string, QueryValue>>,
): Promise<string> {
  const create = definition.create;
  if (!create) throw new Error(`Entity table '${definition.tableName}' does not support creation`);
  const columns = create.attributes.map((attribute) => {
    const value = values[attribute.attribute];
    validateCreateValue(attribute, value);
    return {
      attribute: attribute.attribute,
      values:
        attribute.optional && value === ""
          ? { type: "nullable_string" as const, values: [null] }
          : attribute.valueType === "int"
            ? { type: "int" as const, values: [value as number] }
            : { type: "string" as const, values: [value as string] },
    };
  });
  const identity = values[definition.identityAttribute];
  if (typeof identity !== "string") throw new Error("Created record identity must be a string");
  await service.post("/api/mutate", { steps: [{ insert: { table_name: definition.tableName, columns } }] });
  return identity;
}

export async function updateRecord(
  service: FetchService,
  definition: MasterDetailDefinition,
  id: string,
  fields: readonly RecordFieldValue[],
): Promise<void> {
  await updateRecords(service, definition, [{ id, fields }]);
}

export async function updateRecords(
  service: FetchService,
  definition: MasterDetailDefinition,
  updates: readonly RecordUpdate[],
): Promise<void> {
  if (!updates.length) return;
  const groups = new Map<
    string,
    {
      ids: string[];
      columns: { attribute: string; values: { type: string; values: (QueryValue | null)[] } }[];
    }
  >();
  for (const { id, fields } of updates) {
    const orderedFields = [...fields].sort((a, b) => a.field.attribute.localeCompare(b.field.attribute));
    const encoded = orderedFields.map(({ field, value }) => ({
      attribute: field.attribute,
      type: field.optional && value === "" ? "nullable_string" : field.control === "integer" ? "int" : "string",
      value: field.optional && value === "" ? null : value,
    }));
    const signature = JSON.stringify(encoded.map(({ attribute, type }) => [attribute, type]));
    let group = groups.get(signature);
    if (!group) {
      group = {
        ids: [],
        columns: encoded.map(({ attribute, type }) => ({ attribute, values: { type, values: [] } })),
      };
      groups.set(signature, group);
    }
    group.ids.push(id);
    encoded.forEach(({ value }, index) => group.columns[index].values.values.push(value));
  }
  await service.post("/api/mutate", {
    steps: [...groups.values()].map(({ ids, columns }) => ({
      update: {
        table_name: definition.tableName,
        ids,
        columns,
      },
    })),
  });
}

function validateCreateValue(attribute: CreateRecordDefinition["attributes"][number], value: QueryValue | undefined) {
  const valid = attribute.valueType === "string" ? typeof value === "string" : Number.isSafeInteger(value);
  if (!valid) throw new Error(`Create value for ${attribute.attribute} must be ${attribute.valueType}`);
}
