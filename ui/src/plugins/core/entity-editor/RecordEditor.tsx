import { createSignal, createUniqueId, For, type JSX, Show } from "solid-js";
import { useOptionalApplicationServices } from "../../../base/services/application-services";
import type { FetchService } from "../../../base/services/fetch-service";
import { CloseButton } from "../../../components/CloseButton";
import { Form, useFormField, useFormState } from "../../../components/form/Form";
import { FormValidationMessages } from "../../../components/form/FormValidationMessages";
import { RichTextEditor } from "../../../components/rich-text/RichTextEditor";
import { useOptionalLinkService } from "../links/link-service";
import { Select } from "../../../components/Select";
import { DataText, ModelText } from "../../../components/SourceText";
import { DataChangeService } from "../data-changes/data-change-service";
import { RecordMutationService } from "../data-changes/record-mutation-service";
import { RecordHistoryDetails } from "../entity-history/RecordHistoryDetails";
import { type LookupEntry, useLookupService } from "../lookups/lookup";
import type { QueryResult } from "../query/query-result";
import { type EditFieldDefinition, type EntityEditorDefinition } from "./definition";
import styles from "./RecordEditor.module.css";
import { createRecordCreationStore, createRecordEditorStore, type RecordEditorStore } from "./record-editor-store";

export type EntityEditorMode =
  | { readonly type: "edit"; readonly result: QueryResult; readonly recordId: string }
  | { readonly type: "create"; readonly onCreated: (recordId: string) => void | Promise<void> };

export function RecordEditor(props: {
  definition: EntityEditorDefinition;
  fetchService: FetchService;
  mode: EntityEditorMode;
  onClose: () => void;
  onOpenPage?: () => void;
  hideFieldLabels?: boolean;
  bare?: boolean;
  onPublish?: () => Promise<void>;
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
  definition: EntityEditorDefinition;
  fetchService: FetchService;
  mode: Extract<EntityEditorMode, { type: "edit" }>;
  onClose: () => void;
  onOpenPage?: () => void;
  hideFieldLabels?: boolean;
  bare?: boolean;
  onPublish?: () => Promise<void>;
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

  const content = () => (
    <Show when={!store.validationError()} fallback={<div class={styles.state}>{store.validationError()}</div>}>
      <Show when={store.row()} fallback={<div class={styles.state}>Record not found.</div>}>
        {(currentRow) => (
          <Show keyed when={props.mode.recordId}>
            {(_recordId) => (
              <Form model={store.model(currentRow())} persistence={{ type: "autosave", onSave: store.save }}>
                <RecordFormBinding store={store} />
                <EditorLayout
                  fields={props.definition.fields}
                  hideFieldLabels={props.hideFieldLabels}
                  plainRichText={props.bare}
                >
                  <SaveStatus saved={store.saved} />
                  <Show when={props.onPublish}>{(publish) => <PublishButton onPublish={publish()} />}</Show>
                </EditorLayout>
              </Form>
            )}
          </Show>
        )}
      </Show>
    </Show>
  );
  if (props.bare) return content();
  return (
    <RecordHistoryDetails
      definition={props.definition}
      recordId={props.mode.recordId}
      dataChanges={dataChanges}
      onClose={props.onClose}
      onOpenPage={props.onOpenPage}
      heading={
        <h2 class={styles.detailTitle}>
          <Show
            when={store.row() && props.definition.recordLabel}
            fallback={
              <ModelText>
                <strong>{props.definition.detailTitle}</strong>
              </ModelText>
            }
          >
            <DataText>
              <strong>{props.definition.recordLabel!(props.mode.result, store.row()!)}</strong>
            </DataText>
          </Show>
        </h2>
      }
    >
      {content()}
    </RecordHistoryDetails>
  );
}

function RecordFormBinding(props: { store: RecordEditorStore }) {
  props.store.attachForm(useFormState());
  return null;
}

function CreateRecordEditor(props: {
  definition: EntityEditorDefinition;
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
  title?: string;
  fields: readonly EditFieldDefinition[];
  onClose?: () => void;
  children: JSX.Element;
  hideFieldLabels?: boolean;
  plainRichText?: boolean;
}) {
  return (
    <div class={styles.form}>
      <Show when={props.title}>
        <header class={styles.header}>
          <h2>
            <ModelText>
              <strong>{props.title}</strong>
            </ModelText>
          </h2>
          <Show when={props.onClose}>{(close) => <CloseButton label="Close details" onClick={close()} />}</Show>
        </header>
      </Show>
      <For each={props.fields}>
        {(field) => <EditorField field={field} hideLabel={props.hideFieldLabels} plainRichText={props.plainRichText} />}
      </For>
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

function PublishButton(props: { onPublish: () => Promise<void> }) {
  const form = useFormState();
  const [publishing, setPublishing] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const publish = async () => {
    setError(undefined);
    if (!(await form.saveNow())) {
      setError(form.saveError()?.message ?? "Save the draft before publishing.");
      return;
    }
    setPublishing(true);
    try {
      await props.onPublish();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPublishing(false);
    }
  };
  return (
    <div class={styles.actions}>
      <Show when={error()}>
        {(message) => (
          <span class={styles.error} role="alert">
            {message()}
          </span>
        )}
      </Show>
      <button type="button" class={styles.primary} disabled={publishing()} onClick={() => void publish()}>
        {publishing() ? "Publishing" : "Publish"}
      </button>
    </div>
  );
}

function EditorField(props: { field: EditFieldDefinition; hideLabel?: boolean; plainRichText?: boolean }) {
  const formField = useFormField(props.field.attribute);
  const linkService = useOptionalLinkService();
  const lookupService = props.field.lookup ? useLookupService() : undefined;
  const inputId = createUniqueId();
  const messagesId = `${inputId}-messages`;
  const hasValidationMessages = () => formField.validationMessages().some((failure) => failure.touched);
  return (
    <div class={styles.field}>
      <Show when={!props.hideLabel}>
        <label for={inputId}>
          <ModelText>{formField.label}</ModelText>
        </label>
      </Show>
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
                  aria-label={props.hideLabel ? formField.label : undefined}
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
                aria-label={props.hideLabel ? formField.label : undefined}
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
          links={linkService}
          plain={props.plainRichText}
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
