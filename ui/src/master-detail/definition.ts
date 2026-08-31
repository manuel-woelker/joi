import type { FormValues } from "../components/form/Form";
import type { QueryResult, QueryResultRow, QueryValue, QueryValueType } from "../query/query-result";
import type { ValidationFunction } from "../validation/validation";
import type { LookupId } from "../lookups/lookup";

export type EditControl = "text" | "textarea" | "integer" | "lookup";

export interface EditFieldDefinition {
  readonly attribute: string;
  readonly label: string;
  readonly control: EditControl;
  readonly required?: boolean;
  readonly rows?: number;
  readonly placeholder?: string;
  readonly readonly?: boolean;
  readonly disabled?: boolean;
  readonly lookup?: LookupId;
  readonly optional?: boolean;
  /** Validation evaluated with the field's current string value. */
  readonly validation?: ValidationFunction<string>;
}

export interface MasterDetailDefinition {
  readonly tableName: string;
  readonly identityAttribute: string;
  readonly detailTitle: string;
  readonly fields: readonly EditFieldDefinition[];
  readonly validation?: (result: QueryResult, row: QueryResultRow) => ValidationFunction<FormValues>;
  readonly create?: CreateRecordDefinition;
}

export interface CreateAttributeDefinition {
  readonly attribute: string;
  readonly valueType: QueryValueType;
  readonly optional?: boolean;
  readonly initialValue: () => QueryValue;
}

export interface CreateRecordDefinition {
  readonly title: string;
  readonly attributes: readonly CreateAttributeDefinition[];
  readonly fields: readonly EditFieldDefinition[];
  readonly validation?: ValidationFunction<Readonly<Record<string, QueryValue>>>;
}

export function validateMasterDetailDefinition(result: QueryResult, definition: MasterDetailDefinition): void {
  const identity = result.requireColumn(definition.identityAttribute);
  if (identity.type !== "string") throw new Error("Record identity attribute must be a string");

  const attributes = new Set<string>();
  for (const field of definition.fields) {
    if (!field.attribute || attributes.has(field.attribute)) {
      throw new Error(`Duplicate or empty editable attribute ${field.attribute}`);
    }
    attributes.add(field.attribute);
    const column = result.requireColumn(field.attribute);
    const expected: QueryValueType = field.control === "integer" ? "int" : "string";
    if (column.type !== expected) {
      throw new Error(`Editor for ${field.attribute} requires ${expected} values, received ${column.type}`);
    }
  }
}
