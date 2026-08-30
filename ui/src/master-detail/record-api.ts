import type { QueryValue } from "../query/query-result";
import type { FetchService } from "../services/fetch-service";
import type { CreateRecordDefinition, EditFieldDefinition, MasterDetailDefinition } from "./definition";

export interface RecordFieldValue {
  readonly field: EditFieldDefinition;
  readonly value: QueryValue;
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
        attribute.valueType === "int"
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
  await service.post("/api/mutate", {
    steps: [
      {
        update: {
          table_name: definition.tableName,
          ids: [id],
          columns: fields.map(({ field, value }) => ({
            attribute: field.attribute,
            values:
              field.control === "integer" ? { type: "int", values: [value] } : { type: "string", values: [value] },
          })),
        },
      },
    ],
  });
}

function validateCreateValue(attribute: CreateRecordDefinition["attributes"][number], value: QueryValue | undefined) {
  const valid = attribute.valueType === "string" ? typeof value === "string" : Number.isSafeInteger(value);
  if (!valid) throw new Error(`Create value for ${attribute.attribute} must be ${attribute.valueType}`);
}
