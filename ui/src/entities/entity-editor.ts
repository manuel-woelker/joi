import type { FormValues } from "../components/form/Form";
import type { MasterDetailDefinition } from "../master-detail/definition";
import type { QueryResult, QueryResultRow, QueryValue } from "../query/query-result";
import type { ValidationContext, ValidationFunction } from "../validation/validation";
import type { AnyEntityAttribute, EntityDescription } from "./entity-description";

/** Derives the existing master-detail editor contract from an entity description. */
export function createEntityEditorDefinition(description: EntityDescription): MasterDetailDefinition {
  return {
    tableName: description.tableName,
    identityAttribute: description.identityAttribute,
    detailTitle: `${description.label} details`,
    fields: description.attributes.flatMap((attribute) =>
      attribute.edit
        ? [
            {
              attribute: attribute.id,
              label: attribute.label,
              control: attribute.edit.control,
              required: attribute.edit.required,
              rows: attribute.edit.rows,
              placeholder: attribute.edit.placeholder,
              readonly: attribute.edit.readonly,
              disabled: attribute.edit.disabled,
              validation: attributeValidation(attribute),
            },
          ]
        : [],
    ),
    validation: description.validation ? (result, row) => entityValidation(description, result, row) : undefined,
  };
}

function attributeValidation(attribute: AnyEntityAttribute): ValidationFunction<string> | undefined {
  if (!attribute.validation) return undefined;
  if (attribute.valueType === "string") return attribute.validation;
  const validation = attribute.validation;
  return ({ value, addValidationFailure }) => {
    const parsed = parseInteger(value);
    if (parsed === undefined) {
      addValidationFailure({ message: `${attribute.label} must be an integer.` });
      return;
    }
    validation({ value: parsed, addValidationFailure });
  };
}

function entityValidation(
  description: EntityDescription,
  result: QueryResult,
  row: QueryResultRow,
): ValidationFunction<FormValues> {
  return ({ value, addValidationFailure }) => {
    const values: Record<string, QueryValue> = {};
    let parsingFailed = false;
    for (const attribute of description.attributes) {
      const raw = attribute.edit ? value[attribute.id] : row.value(result.requireColumn(attribute.id));
      if (attribute.valueType === "string" && typeof raw === "string") {
        values[attribute.id] = raw;
      } else if (attribute.valueType === "int") {
        const parsed = typeof raw === "number" ? raw : parseInteger(raw);
        if (parsed !== undefined) values[attribute.id] = parsed;
        else {
          parsingFailed = true;
          addValidationFailure({ attribute: attribute.id, message: `${attribute.label} must be an integer.` });
        }
      } else {
        parsingFailed = true;
        addValidationFailure({ attribute: attribute.id, message: `${attribute.label} has an invalid value.` });
      }
    }
    if (!parsingFailed) runEntityValidation(description, values, addValidationFailure);
  };
}

function runEntityValidation(
  description: EntityDescription,
  values: Readonly<Record<string, QueryValue>>,
  addValidationFailure: ValidationContext<unknown>["addValidationFailure"],
): void {
  description.validation?.({ value: values, addValidationFailure });
}

function parseInteger(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
