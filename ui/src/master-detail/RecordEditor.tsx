import { For, Show, createEffect, createMemo, createSignal } from "solid-js";

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
  onSaved: () => Promise<unknown> | unknown;
}) {
  const [draft, setDraft] = createSignal<Record<string, string>>({});
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

  createEffect(() => {
    const current = row();
    if (!current || validationError()) return;
    setDraft(
      Object.fromEntries(
        props.definition.fields.map((field) => [
          field.attribute,
          String(current.value(props.result.requireColumn(field.attribute)) ?? ""),
        ]),
      ),
    );
  });

  const save = async (event: SubmitEvent) => {
    event.preventDefault();
    const values = fieldValues(props.definition.fields, draft());
    if (values instanceof Error) {
      setSaveError(values.message);
      return;
    }
    setSaving(true);
    setSaveError(undefined);
    setSaved(false);
    try {
      await updateRecord(props.fetchService, props.definition, props.recordId, values);
      await props.onSaved();
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Record could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Show when={!validationError()} fallback={<div class={styles.state}>{validationError()}</div>}>
      <Show when={row()} fallback={<div class={styles.state}>Record not found.</div>}>
        <form class={styles.form} onSubmit={save}>
          <header class={styles.header}>
            <h2>{props.definition.detailTitle}</h2>
            <button type="button" class={styles.close} aria-label="Close details" onClick={props.onClose}>
              ×
            </button>
          </header>
          <For each={props.definition.fields}>
            {(field) => (
              <label>
                <span>{field.label}</span>
                <Show
                  when={field.control === "textarea"}
                  fallback={
                    <input
                      type={field.control === "integer" ? "number" : "text"}
                      value={draft()[field.attribute] ?? ""}
                      required={field.required}
                      onInput={(event) => setDraft({ ...draft(), [field.attribute]: event.currentTarget.value })}
                    />
                  }
                >
                  <textarea
                    value={draft()[field.attribute] ?? ""}
                    required={field.required}
                    rows={field.rows ?? 8}
                    onInput={(event) => setDraft({ ...draft(), [field.attribute]: event.currentTarget.value })}
                  />
                </Show>
              </label>
            )}
          </For>
          <div class={styles.actions}>
            <Show when={saveError()}>
              {(message) => (
                <span class={styles.error} role="alert">
                  {message()}
                </span>
              )}
            </Show>
            <Show when={saved()}>
              <span class={styles.saved}>Saved</span>
            </Show>
            <button type="submit" disabled={saving()}>
              {saving() ? "Saving" : "Save changes"}
            </button>
          </div>
        </form>
      </Show>
    </Show>
  );
}

function findRecord(result: QueryResult, identityAttribute: string, id: string): QueryResultRow | undefined {
  const identity = result.column(identityAttribute);
  return identity ? result.rows.find((row) => row.value(identity) === id) : undefined;
}

function fieldValues(
  fields: readonly EditFieldDefinition[],
  draft: Readonly<Record<string, string>>,
): readonly RecordFieldValue[] | Error {
  const values: RecordFieldValue[] = [];
  for (const field of fields) {
    const raw = draft[field.attribute] ?? "";
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
