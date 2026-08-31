import { For, Show, createMemo, createResource, createSignal, createUniqueId, type JSX } from "solid-js";

import {
  Form,
  useFormField,
  useFormState,
  type FormChanges,
  type FormModel,
  type FormValues,
} from "../components/form/Form";
import { FormValidationMessages } from "../components/form/FormValidationMessages";
import type { QueryResult, QueryResultRow, QueryValue } from "../query/query-result";
import type { FetchService } from "../services/fetch-service";
import type { ValidationFunction } from "../validation/validation";
import { notEmpty } from "../validation/validation-functions";
import { useLookupService } from "../lookups/lookup";
import {
  validateMasterDetailDefinition,
  type CreateRecordDefinition,
  type EditFieldDefinition,
  type MasterDetailDefinition,
} from "./definition";
import { createRecord, updateRecord, type RecordFieldValue } from "./record-api";
import styles from "./RecordEditor.module.css";

export type EntityEditorMode =
  | { readonly type: "edit"; readonly result: QueryResult; readonly recordId: string }
  | { readonly type: "create"; readonly onCreated: (recordId: string) => void | Promise<void> };

export function RecordEditor(props: {
  definition: MasterDetailDefinition;
  fetchService: FetchService;
  mode: EntityEditorMode;
  onClose: () => void;
}) {
  return (
    <Show
      when={props.mode.type === "create"}
      fallback={<EditRecordEditor {...props} mode={props.mode as Extract<EntityEditorMode, { type: "edit" }>} />}
    >
      <CreateRecordEditor {...props} mode={props.mode as Extract<EntityEditorMode, { type: "create" }>} />
    </Show>
  );
}

function EditRecordEditor(props: {
  definition: MasterDetailDefinition;
  fetchService: FetchService;
  mode: Extract<EntityEditorMode, { type: "edit" }>;
  onClose: () => void;
}) {
  const [saved, setSaved] = createSignal(false);
  const validationError = createMemo(() => {
    try {
      validateMasterDetailDefinition(props.mode.result, props.definition);
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : "Invalid editor definition";
    }
  });
  const row = createMemo(() => findRecord(props.mode.result, props.definition.identityAttribute, props.mode.recordId));
  const save = async (changes: FormChanges) => {
    const values = fieldValues(props.definition.fields, changes);
    if (values instanceof Error) throw values;
    setSaved(false);
    await updateRecord(props.fetchService, props.definition, props.mode.recordId, values);
    const currentRow = row();
    if (currentRow) {
      props.mode.result.updateRow(
        currentRow,
        values.map(({ field, value }) => ({ column: props.mode.result.requireColumn(field.attribute), value })),
      );
    }
    setSaved(true);
  };

  return (
    <Show when={!validationError()} fallback={<div class={styles.state}>{validationError()}</div>}>
      <Show when={row()} fallback={<div class={styles.state}>Record not found.</div>}>
        {(currentRow) => (
          <Show keyed when={props.mode.recordId}>
            {(_recordId) => (
              <Form
                model={editFormModel(props.mode.result, props.definition, currentRow())}
                persistence={{ type: "autosave", onSave: save }}
              >
                <EditorLayout
                  title={props.definition.detailTitle}
                  fields={props.definition.fields}
                  onClose={props.onClose}
                >
                  <SaveStatus saved={saved} />
                </EditorLayout>
              </Form>
            )}
          </Show>
        )}
      </Show>
    </Show>
  );
}

function CreateRecordEditor(props: {
  definition: MasterDetailDefinition;
  fetchService: FetchService;
  mode: Extract<EntityEditorMode, { type: "create" }>;
  onClose: () => void;
}) {
  const create = props.definition.create;
  if (!create) return <div class={styles.state}>Creation is not configured for this entity.</div>;
  const initialValues = Object.fromEntries(
    create.attributes.map((attribute) => [attribute.attribute, attribute.initialValue()]),
  );
  const submit = async (formValues: FormValues) => {
    const values = createValues(create, formValues, initialValues);
    if (values instanceof Error) throw values;
    const id = await createRecord(props.fetchService, props.definition, values);
    await props.mode.onCreated(id);
  };
  return (
    <Form model={createFormModel(create, initialValues)} persistence={{ type: "submit", onSubmit: submit }}>
      <EditorLayout title={create.title} fields={create.fields} onClose={props.onClose}>
        <CreateActions onCancel={props.onClose} />
      </EditorLayout>
    </Form>
  );
}

function EditorLayout(props: {
  title: string;
  fields: readonly EditFieldDefinition[];
  onClose: () => void;
  children: JSX.Element;
}) {
  return (
    <div class={styles.form}>
      <header class={styles.header}>
        <h2>{props.title}</h2>
        <button type="button" class={styles.close} aria-label="Close details" onClick={props.onClose}>
          ×
        </button>
      </header>
      <For each={props.fields}>{(field) => <EditorField field={field} />}</For>
      {props.children}
    </div>
  );
}

function CreateActions(props: { onCancel: () => void }) {
  const form = useFormState();
  return (
    <div class={styles.actions}>
      <FormValidationMessages />
      <Show when={form.saveError()}>
        {(error) => (
          <span class={styles.error} role="alert">
            {error().message}
          </span>
        )}
      </Show>
      <button type="button" class={styles.secondary} disabled={form.saving()} onClick={form.reset}>
        Reset
      </button>
      <button type="button" class={styles.secondary} disabled={form.saving()} onClick={props.onCancel}>
        Cancel
      </button>
      <button type="button" class={styles.primary} disabled={form.saving()} onClick={() => void form.submit()}>
        {form.saving() ? "Creating" : "Create"}
      </button>
    </div>
  );
}

function SaveStatus(props: { saved: () => boolean }) {
  const form = useFormState();
  return (
    <div class={styles.actions}>
      <FormValidationMessages />
      <Show when={form.saveError()}>
        {(error) => (
          <span class={styles.error} role="alert">
            {error().message}
          </span>
        )}
      </Show>
      <Show when={form.saving()}>
        <span class={styles.saving}>Saving</span>
      </Show>
      <Show when={props.saved() && !form.saving() && !form.dirty()}>
        <span class={styles.saved}>Saved</span>
      </Show>
    </div>
  );
}

function EditorField(props: { field: EditFieldDefinition }) {
  const formField = useFormField(props.field.attribute);
  const lookupService = props.field.lookup ? useLookupService() : undefined;
  const [lookupEntries] = createResource(
    () => props.field.lookup,
    (lookup) => lookupService!.entries(lookup),
  );
  const inputId = createUniqueId();
  const messagesId = `${inputId}-messages`;
  const hasValidationMessages = () => formField.validationMessages().some((failure) => failure.touched);
  return (
    <div class={styles.field}>
      <label for={inputId}>{formField.label}</label>
      <Show
        when={props.field.control !== "lookup"}
        fallback={
          <select
            id={inputId}
            value={formField.value}
            required={props.field.required}
            disabled={formField.disabled || lookupEntries.loading}
            aria-invalid={hasValidationMessages()}
            aria-describedby={hasValidationMessages() ? messagesId : undefined}
            onInput={formField.onInput}
            onBlur={formField.onBlur}
          >
            <option value="">
              {lookupEntries.loading
                ? "Loading..."
                : props.field.optional
                  ? "Unassigned"
                  : `Select ${formField.label.toLowerCase()}`}
            </option>
            <For each={lookupEntries()}>{(entry) => <option value={entry.id}>{entry.label}</option>}</For>
          </select>
        }
      >
        <Show
          when={props.field.control === "textarea"}
          fallback={
            <input
              id={inputId}
              type={props.field.control === "integer" ? "number" : "text"}
              value={formField.value}
              placeholder={formField.placeholder}
              readOnly={formField.readonly}
              disabled={formField.disabled}
              required={props.field.required}
              aria-invalid={hasValidationMessages()}
              aria-describedby={hasValidationMessages() ? messagesId : undefined}
              onInput={formField.onInput}
              onBlur={formField.onBlur}
            />
          }
        >
          <textarea
            id={inputId}
            value={formField.value}
            placeholder={formField.placeholder}
            readOnly={formField.readonly}
            disabled={formField.disabled}
            required={props.field.required}
            rows={props.field.rows ?? 8}
            aria-invalid={hasValidationMessages()}
            aria-describedby={hasValidationMessages() ? messagesId : undefined}
            onInput={formField.onInput}
            onBlur={formField.onBlur}
          />
        </Show>
      </Show>
      <FormValidationMessages attribute={formField.id} id={messagesId} />
    </div>
  );
}

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
  const validateRequired = field.required ? notEmpty(`${field.label} is required.`) : undefined;
  if (!validateRequired) return field.validation;
  if (!field.validation) return validateRequired;
  return (context) => {
    validateRequired(context);
    field.validation?.(context);
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
