import { Show, createSignal, createUniqueId } from "solid-js";

import type { ComponentDemo } from "../../playground/demo";
import { matches, notEmpty } from "../../validation/validation-functions";
import { Form, useFormField, useFormState, type FormField } from "./Form";
import styles from "./Form.demo.module.css";
import { FormValidationMessages } from "./FormValidationMessages";

function BasicFormField(props: { fieldName: string }) {
  const formField = useFormField(props.fieldName);
  const inputId = createUniqueId();
  const messagesId = `${inputId}-messages`;
  return (
    <div class={styles.field}>
      <label for={inputId}>{formField.label}</label>
      <input
        id={inputId}
        value={formField.value}
        placeholder={formField.placeholder}
        readOnly={formField.readonly}
        aria-invalid={formField.validationMessages().length > 0}
        aria-describedby={formField.validationMessages().length > 0 ? messagesId : undefined}
        onInput={formField.onInput}
      />
      <FormValidationMessages attribute={formField.id} id={messagesId} />
    </div>
  );
}

function FieldValue(props: { fieldName: string }) {
  const formField = useFormField(props.fieldName);
  return (
    <div class={styles.currentValue}>
      <span>Current value</span>
      <output>{formField.value}</output>
    </div>
  );
}

function DirtyState() {
  const form = useFormState();
  return <span class={styles.dirtyState}>{form.dirty() ? "Dirty" : "Clean"}</span>;
}

function DebouncedFormDemo() {
  const [savedChanges, setSavedChanges] = createSignal("Waiting for changes");
  const [mounted, setMounted] = createSignal(true);
  const validateNameIsPresent = notEmpty("Enter a name.");
  const validateNameFormat = matches(/^[\p{L} '-]+$/u, "Use letters, spaces, apostrophes, or hyphens.");
  return (
    <div class={styles.formDemo}>
      <Show when={mounted()} fallback={<p class={styles.unmounted}>Form unmounted</p>}>
        <Form
          model={{
            attributes: [
              {
                id: "name",
                label: "Name",
                initialValue: "Elliot",
                validation(context) {
                  validateNameIsPresent(context);
                  validateNameFormat(context);
                },
              },
            ],
          }}
          onSave={(changes) => {
            setSavedChanges(JSON.stringify(changes));
          }}
        >
          <BasicFormField fieldName="name" />
          <FieldValue fieldName="name" />
          <DirtyState />
        </Form>
      </Show>
      <button class={styles.mountButton} type="button" onClick={() => setMounted((value) => !value)}>
        {mounted() ? "Unmount form" : "Mount form"}
      </button>
      <div class={styles.saveStatus}>
        <span>Last saved changes</span>
        <output aria-live="polite">{savedChanges()}</output>
      </div>
    </div>
  );
}

function ReadonlyFormDemo() {
  return (
    <div class={styles.formDemo}>
      <Form
        model={{
          attributes: [{ id: "identifier", label: "Identifier", initialValue: "user-2jx4", readonly: true }],
        }}
      >
        <BasicFormField fieldName="identifier" />
        <FieldValue fieldName="identifier" />
        <ReadonlyBehavior fieldName="identifier" />
      </Form>
    </div>
  );
}

function PlaceholderFormDemo() {
  return (
    <div class={styles.formDemo}>
      <Form
        model={{
          attributes: [{ id: "summary", label: "Summary", initialValue: "", placeholder: "Briefly describe it" }],
        }}
      >
        <BasicFormField fieldName="summary" />
        <FieldValue fieldName="summary" />
      </Form>
    </div>
  );
}

function ReadonlyBehavior(props: { fieldName: string }) {
  const field = useFormField(props.fieldName);
  const [error, setError] = createSignal<string>();
  const invokeInputHandler = () => {
    try {
      field.onInput({} as Parameters<FormField["onInput"]>[0]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return (
    <>
      <div class={styles.currentValue}>
        <span>Readonly flag</span>
        <output>{String(field.readonly)}</output>
      </div>
      <button class={styles.mountButton} type="button" onClick={invokeInputHandler}>
        Invoke input handler
      </button>
      <Show when={error()}>
        {(message) => (
          <output class={styles.exception} role="alert">
            {message()}
          </output>
        )}
      </Show>
    </>
  );
}

export default {
  name: "Form",
  description: "Form for editing data through context-aware fields.",
  scenarios: [
    {
      name: "Minimal",
      description: "A shared reactive field saved after 500 milliseconds without input.",
      render: () => <DebouncedFormDemo />,
    },
    {
      name: "Readonly",
      description: "A field that exposes its value while rejecting user input.",
      render: () => <ReadonlyFormDemo />,
    },
    {
      name: "Placeholder",
      description: "An empty field with a short input hint.",
      render: () => <PlaceholderFormDemo />,
    },
  ],
} satisfies ComponentDemo;
