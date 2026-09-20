import { createMemo, createSignal, onCleanup, type Accessor } from "solid-js";
import type { FormChanges, FormModel, FormValues, FormRuntimeState } from "../../../components/form/Form";
import { richTextPlainText } from "../../../components/rich-text/html";
import type { QueryResult, QueryResultRow, QueryValue } from "../query/query-result";
import type { FetchService } from "../../../base/services/fetch-service";
import type { ValidationFunction } from "../../../validation/validation";
import { notEmpty } from "../../../validation/validation-functions";
import type { DataChangeService } from "../data-changes/data-change-service";
import type { RecordMutationService } from "../data-changes/record-mutation-service";
import {
  validateMasterDetailDefinition,
  type CreateRecordDefinition,
  type EditFieldDefinition,
  type MasterDetailDefinition,
} from "./definition";
import { createRecord, type RecordFieldValue } from "./record-api";

/** Dependencies shared by standalone and master-detail record editors. */
export interface RecordEditorDependencies {
  readonly fetchService: FetchService;
  readonly dataChanges: Pick<DataChangeService, "subscribe">;
  readonly recordMutations: Pick<RecordMutationService, "update">;
}

/** Coordinates one selected record; the Form runtime retains all draft state. */
export function createRecordEditorStore(
  options: {
    readonly definition: MasterDetailDefinition;
    readonly result: Accessor<QueryResult>;
    readonly recordId: Accessor<string>;
  },
  dependencies: RecordEditorDependencies,
) {
  const [saved, setSaved] = createSignal(false);
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  const validationError = createMemo(() => {
    try {
      validateMasterDetailDefinition(options.result(), options.definition);
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : "Invalid editor definition";
    }
  });
  const row = createMemo(() => findRecord(options.result(), options.definition.identityAttribute, options.recordId()));
  const save = async (changes: FormChanges) => {
    const id = options.recordId();
    const values = fieldValues(options.definition.fields, changes);
    if (values instanceof Error) throw values;
    setSaved(false);
    await dependencies.recordMutations.update(
      options.definition,
      id,
      Object.fromEntries(values.map(({ field, value }) => [field.attribute, value])),
    );
    if (!disposed && options.recordId() === id) setSaved(true);
  };
  return {
    saved,
    validationError,
    row,
    save,
    model: (currentRow: QueryResultRow) => editFormModel(options.result(), options.definition, currentRow),
    /** Connects a mounted Form runtime; cleanup belongs to that Form's owner. */
    attachForm(form: Pick<FormRuntimeState, "reconcile">) {
      const unsubscribe = dependencies.dataChanges.subscribe(
        { tableName: options.definition.tableName, recordId: options.recordId() },
        (change) => {
          form.reconcile(
            Object.fromEntries(Object.entries(change.changes).map(([key, value]) => [key, String(value ?? "")])),
          );
          reconcileRecordResult(
            options.result(),
            options.definition.identityAttribute,
            change.recordId,
            change.changes,
          );
        },
      );
      onCleanup(unsubscribe);
    },
  };
}

/** Creates defaults once and coordinates explicit submission for a new record. */
export function createRecordCreationStore(
  definition: MasterDetailDefinition,
  dependencies: Pick<RecordEditorDependencies, "fetchService">,
  onCreated: (recordId: string) => void | Promise<void>,
) {
  const create = definition.create;
  if (!create) return undefined;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  const initialValues = Object.fromEntries(
    create.attributes.map((attribute) => [attribute.attribute, attribute.initialValue()]),
  );
  return {
    model: createFormModel(create, initialValues),
    async submit(formValues: FormValues) {
      const values = createValues(create, formValues, initialValues);
      if (values instanceof Error) throw values;
      const id = await createRecord(dependencies.fetchService, definition, values);
      if (!disposed) await onCreated(id);
    },
  };
}

/** Applies committed fields once, preserving response-local row and column identities. */
export function reconcileRecordResult(
  result: QueryResult,
  identityAttribute: string,
  recordId: string,
  changes: Readonly<Record<string, QueryValue>>,
) {
  const row = findRecord(result, identityAttribute, recordId);
  if (!row) return;
  const updates = Object.entries(changes).flatMap(([attribute, value]) => {
    const column = result.column(attribute);
    return column && row.value(column) !== value ? [{ column, value }] : [];
  });
  if (updates.length) result.updateRow(row, updates);
}

/** State and operations consumed by RecordEditor. */
export type RecordEditorStore = ReturnType<typeof createRecordEditorStore>;

function findRecord(result: QueryResult, identityAttribute: string, id: string): QueryResultRow | undefined {
  const identity = result.column(identityAttribute);
  return identity ? result.rows.find((row) => row.value(identity) === id) : undefined;
}

function editFormModel(result: QueryResult, definition: MasterDetailDefinition, row: QueryResultRow): FormModel {
  return {
    attributes: definition.fields.map((field) => ({
      id: field.attribute,
      label: field.label,
      initialValue: String(row.value(result.requireColumn(field.attribute)) ?? ""),
      placeholder: field.placeholder,
      readonly: field.readonly,
      disabled: field.disabled,
      validation: fieldValidation(field),
    })),
    validation: definition.validation?.(result, row),
  };
}

function createFormModel(
  create: CreateRecordDefinition,
  initialValues: Readonly<Record<string, QueryValue>>,
): FormModel {
  return {
    attributes: create.fields.map((field) => ({
      id: field.attribute,
      label: field.label,
      initialValue: String(initialValues[field.attribute] ?? ""),
      placeholder: field.placeholder,
      validation: fieldValidation(field),
    })),
    validation: create.validation
      ? ({ value, addValidationFailure }) => {
          const values = createValues(create, value, initialValues);
          if (!(values instanceof Error)) create.validation?.({ value: values, addValidationFailure });
        }
      : undefined,
  };
}

function fieldValidation(field: EditFieldDefinition): ValidationFunction<string> | undefined {
  const validateRequired = field.required
    ? field.control === "html"
      ? htmlNotEmpty(`${field.label} is required.`)
      : notEmpty(`${field.label} is required.`)
    : undefined;
  if (!validateRequired) return field.validation;
  if (!field.validation) return validateRequired;
  return (context) => {
    validateRequired(context);
    field.validation?.(context);
  };
}

function htmlNotEmpty(message: string): ValidationFunction<string> {
  return ({ value, addValidationFailure }) => {
    if (!richTextPlainText(value).trim()) addValidationFailure({ message });
  };
}

function fieldValues(
  fields: readonly EditFieldDefinition[],
  changes: FormChanges,
): readonly RecordFieldValue[] | Error {
  const values: RecordFieldValue[] = [];
  for (const [attribute, raw] of Object.entries(changes)) {
    const field = fields.find((candidate) => candidate.attribute === attribute);
    if (!field) return new Error(`Unknown editable field ${attribute}`);
    if (field.control !== "integer") values.push({ field, value: raw });
    else {
      const value = Number(raw);
      if (!Number.isSafeInteger(value)) return new Error(`${field.label} must be an integer.`);
      values.push({ field, value });
    }
  }
  return values;
}

function createValues(
  create: CreateRecordDefinition,
  formValues: FormValues,
  initialValues: Readonly<Record<string, QueryValue>>,
): Readonly<Record<string, QueryValue>> | Error {
  const values: Record<string, QueryValue> = { ...initialValues };
  for (const field of create.fields) {
    const raw = formValues[field.attribute];
    if (field.control !== "integer") values[field.attribute] = raw;
    else {
      const parsed = Number(raw);
      if (!Number.isSafeInteger(parsed)) return new Error(`${field.label} must be an integer.`);
      values[field.attribute] = parsed;
    }
  }
  return Object.freeze(values);
}
