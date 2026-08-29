import type { QueryValue } from "../query/query-result";
import type { FetchService } from "../services/fetch-service";
import type { EditFieldDefinition, MasterDetailDefinition } from "./definition";

export interface RecordFieldValue {
  readonly field: EditFieldDefinition;
  readonly value: QueryValue;
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
