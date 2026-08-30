import { For, Show, createMemo, createSignal, createUniqueId } from "solid-js";

import { Form, useFormField, useFormState, type FormChanges, type FormModel } from "../components/form/Form";
import type { QueryResult, QueryResultRow } from "../query/query-result";
import type { FetchService } from "../services/fetch-service";
import { validateMasterDetailDefinition, type EditFieldDefinition, type MasterDetailDefinition } from "./definition";
import { updateRecord, type RecordFieldValue } from "./record-api";
import styles from "./RecordEditor.module.css";

export function RecordEditor(props: {
  definition: MasterDetailDefinition;
  fetchService: FetchService;
  result: QueryResult;
  recordId: string;
  onClose: () => void;
}) {
  const [saving, setSaving] = createSignal(false);
  const [saveError, setSaveError] = createSignal<string>();
  const [saved, setSaved] = createSignal(false);
  const validationError = createMemo(() => {
    try {
      validateMasterDetailDefinition(props.result, props.definition);
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : "Invalid editor definition";
    }
  });
  const row = createMemo(() => findRecord(props.result, props.definition.identityAttribute, props.recordId));

  const save = async (changes: FormChanges) => {
    const values = fieldValues(props.definition.fields, changes);
    if (values instanceof Error) {
      setSaveError(values.message);
      throw values;
    }
    setSaving(true);
    setSaveError(undefined);
    setSaved(false);
    try {
      await updateRecord(props.fetchService, props.definition, props.recordId, values);
      const currentRow = row();
      if (currentRow) {
        props.result.updateRow(
          currentRow,
          values.map(({ field, value }) => ({ column: props.result.requireColumn(field.attribute), value })),
        );
      }
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Record could not be saved.");
      throw error;
    } finally {
      setSaving(false);
    }
  };

  return (
    <Show when={!validationError()} fallback={<div class={styles.state}>{validationError()}</div>}>
      <Show when={row()} fallback={<div class={styles.state}>Record not found.</div>}>
        {(currentRow) => (
          <Show keyed when={props.recordId}>
            {(_recordId) => (
              <Form model={formModel(props.result, props.definition.fields, currentRow())} onSave={save}>
                <div class={styles.form}>
                  <header class={styles.header}>
                    <h2>{props.definition.detailTitle}</h2>
                    <button type="button" class={styles.close} aria-label="Close details" onClick={props.onClose}>
                      ×
                    </button>
                  </header>
                  <For each={props.definition.fields}>{(field) => <EditorField field={field} />}</For>
                  <SaveStatus saving={saving} saved={saved} error={saveError} />
                </div>
              </Form>
            )}
          </Show>
        )}
      </Show>
    </Show>
  );
}

function SaveStatus(props: { saving: () => boolean; saved: () => boolean; error: () => string | undefined }) {
  const form = useFormState();
  return (
    <div class={styles.actions}>
      <Show when={props.error()}>
        {(message) => (
          <span class={styles.error} role="alert">
            {message()}
          </span>
        )}
      </Show>
      <Show when={props.saving()}>
        <span class={styles.saving}>Saving</span>
      </Show>
      <Show when={props.saved() && !props.saving() && !form.dirty()}>
        <span class={styles.saved}>Saved</span>
      </Show>
    </div>
  );
}

function EditorField(props: { field: EditFieldDefinition }) {
  const formField = useFormField(props.field.attribute);
  const inputId = createUniqueId();
  return (
    <div class={styles.field}>
      <label for={inputId}>{formField.label}</label>
      <Show
        when={props.field.control === "textarea"}
        fallback={
          <input
            id={inputId}
            type={props.field.control === "integer" ? "number" : "text"}
            value={formField.value}
            required={props.field.required}
            onInput={formField.onInput}
          />
        }
      >
        <textarea
          id={inputId}
          value={formField.value}
          required={props.field.required}
          rows={props.field.rows ?? 8}
          onInput={formField.onInput}
        />
      </Show>
    </div>
  );
}

function findRecord(result: QueryResult, identityAttribute: string, id: string): QueryResultRow | undefined {
  const identity = result.column(identityAttribute);
  return identity ? result.rows.find((row) => row.value(identity) === id) : undefined;
}

function formModel(result: QueryResult, fields: readonly EditFieldDefinition[], row: QueryResultRow): FormModel {
  return {
    attributes: fields.map((field) => ({
      id: field.attribute,
      label: field.label,
      initialValue: String(row.value(result.requireColumn(field.attribute)) ?? ""),
    })),
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
    if (field.control !== "integer") {
      values.push({ field, value: raw });
      continue;
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value)) return new Error(`${field.label} must be an integer.`);
    values.push({ field, value });
  }
  return values;
}
