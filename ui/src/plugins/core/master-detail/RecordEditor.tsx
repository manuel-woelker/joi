import { For, Show, createUniqueId, type JSX } from "solid-js";
import XIcon from "lucide-solid/icons/x";

import { Form, useFormField, useFormState } from "../../../components/form/Form";
import { FormValidationMessages } from "../../../components/form/FormValidationMessages";
import { Select } from "../../../components/Select";
import { RichTextEditor } from "../../../components/rich-text/RichTextEditor";
import type { QueryResult } from "../query/query-result";
import type { FetchService } from "../../../base/services/fetch-service";
import { useLookupService, type LookupEntry } from "../lookups/lookup";
import { useOptionalApplicationServices } from "../../../base/services/application-services";
import { DataChangeService } from "../data-changes/data-change-service";
import { RecordMutationService } from "../data-changes/record-mutation-service";
import { type EditFieldDefinition, type MasterDetailDefinition } from "./definition";
import { createRecordEditorStore, createRecordCreationStore, type RecordEditorStore } from "./record-editor-store";
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
  const applicationServices = useOptionalApplicationServices();
  const dataChanges = applicationServices?.dataChanges ?? new DataChangeService();
  const recordMutations =
    applicationServices?.recordMutations ?? new RecordMutationService(props.fetchService, dataChanges);
  const store = createRecordEditorStore(
    {
      definition: props.definition,
      result: () => props.mode.result,
      recordId: () => props.mode.recordId,
    },
    { fetchService: props.fetchService, dataChanges, recordMutations },
  );

  return (
    <Show when={!store.validationError()} fallback={<div class={styles.state}>{store.validationError()}</div>}>
      <Show when={store.row()} fallback={<div class={styles.state}>Record not found.</div>}>
        {(currentRow) => (
          <Show keyed when={props.mode.recordId}>
            {(_recordId) => (
              <Form model={store.model(currentRow())} persistence={{ type: "autosave", onSave: store.save }}>
                <RecordFormBinding store={store} />
                <EditorLayout
                  title={props.definition.detailTitle}
                  fields={props.definition.fields}
                  onClose={props.onClose}
                >
                  <SaveStatus saved={store.saved} />
                </EditorLayout>
              </Form>
            )}
          </Show>
        )}
      </Show>
    </Show>
  );
}

function RecordFormBinding(props: { store: RecordEditorStore }) {
  props.store.attachForm(useFormState());
  return null;
}

function CreateRecordEditor(props: {
  definition: MasterDetailDefinition;
  fetchService: FetchService;
  mode: Extract<EntityEditorMode, { type: "create" }>;
  onClose: () => void;
}) {
  const create = props.definition.create;
  if (!create) return <div class={styles.state}>Creation is not configured for this entity.</div>;
  const store = createRecordCreationStore(
    props.definition,
    { fetchService: props.fetchService },
    props.mode.onCreated,
  )!;
  return (
    <Form model={store.model} persistence={{ type: "submit", onSubmit: store.submit }}>
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
          <XIcon size={18} aria-hidden="true" />
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
  const inputId = createUniqueId();
  const messagesId = `${inputId}-messages`;
  const hasValidationMessages = () => formField.validationMessages().some((failure) => failure.touched);
  return (
    <div class={styles.field}>
      <label for={inputId}>{formField.label}</label>
      <Show
        when={props.field.control === "html"}
        fallback={
          <Show
            when={props.field.control !== "lookup"}
            fallback={
              <Select<LookupEntry>
                id={inputId}
                ariaLabel={formField.label}
                value={formField.value}
                onChange={formField.setValue}
                loadEntries={async () => {
                  const entries = await lookupService!.entries(props.field.lookup!);
                  return { entries, total: entries.length };
                }}
                entryId={(entry) => entry.id}
                entryText={(entry) => entry.label}
                emptyLabel={props.field.optional ? "Unassigned" : undefined}
                placeholder={`Search ${formField.label.toLowerCase()}`}
                required={props.field.required}
                disabled={formField.disabled}
                invalid={hasValidationMessages()}
                describedBy={hasValidationMessages() ? messagesId : undefined}
                onBlur={formField.onBlur}
              />
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
        }
      >
        <RichTextEditor
          id={inputId}
          ariaLabel={formField.label}
          value={formField.value}
          onChange={formField.setValue}
          onBlur={formField.setTouched}
          readOnly={formField.readonly}
          disabled={formField.disabled}
          invalid={hasValidationMessages()}
          describedBy={hasValidationMessages() ? messagesId : undefined}
        />
      </Show>
      <FormValidationMessages attribute={formField.id} id={messagesId} />
    </div>
  );
}
