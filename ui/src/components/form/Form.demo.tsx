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
  const visibleValidationMessages = () => formField.validationMessages().filter((failure) => failure.touched);
  return (
    <div class={styles.field}>
      <label for={inputId}>{formField.label}</label>
      <input
        id={inputId}
        value={formField.value}
        placeholder={formField.placeholder}
        readOnly={formField.readonly}
        disabled={formField.disabled}
        aria-invalid={visibleValidationMessages().length > 0}
        aria-describedby={visibleValidationMessages().length > 0 ? messagesId : undefined}
        onInput={formField.onInput}
        onBlur={formField.onBlur}
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

function LifecycleState(props: { fieldName: string }) {
  const form = useFormState();
  const field = useFormField(props.fieldName);
  const rows = () =>
    [
      ["Form dirty", form.dirty()],
      ["Field dirty", field.dirty()],
      ["Touched", field.touched()],
      ["Valid", form.valid()],
      ["Saving", form.saving()],
      ["Save error", form.saveError()?.message ?? "None"],
    ] as const;
  return (
    <div class={styles.lifecycle}>
      {rows().map(([label, value]) => (
        <div class={styles.currentValue}>
          <span>{label}</span>
          <output>{String(value)}</output>
        </div>
      ))}
    </div>
  );
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
          persistence={{
            type: "autosave",
            onSave: async (changes) => {
              await new Promise((resolve) => setTimeout(resolve, 400));
              setSavedChanges(JSON.stringify(changes));
            },
          }}
        >
          <BasicFormField fieldName="name" />
          <FieldValue fieldName="name" />
          <DirtyState />
          <LifecycleState fieldName="name" />
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

function MatchingFieldsFormDemo() {
  return (
    <div class={styles.formDemo}>
      <Form
        model={{
          attributes: [
            { id: "new-password", label: "New password", initialValue: "", placeholder: "Enter a password" },
            {
              id: "confirm-password",
              label: "Confirm password",
              initialValue: "",
              placeholder: "Enter it again",
            },
          ],
          validation({ value, addValidationFailure }) {
            if (value["new-password"] !== value["confirm-password"]) {
              addValidationFailure({ attribute: "confirm-password", message: "Passwords must match." });
            }
          },
        }}
      >
        <BasicFormField fieldName="new-password" />
        <BasicFormField fieldName="confirm-password" />
      </Form>
    </div>
  );
}

function FormLevelValidationDemo() {
  return (
    <div class={styles.formDemo}>
      <Form
        model={{
          attributes: [
            { id: "email", label: "Email", initialValue: "", placeholder: "name@example.com" },
            { id: "phone", label: "Phone", initialValue: "", placeholder: "+49 123 456789" },
          ],
          validation({ value, addValidationFailure }) {
            if (value.email.trim() === "" && value.phone.trim() === "") {
              addValidationFailure({ message: "Provide an email address or phone number." });
            }
          },
        }}
      >
        <BasicFormField fieldName="email" />
        <BasicFormField fieldName="phone" />
        <FormValidationMessages />
      </Form>
    </div>
  );
}

function TouchedFormDemo() {
  return (
    <div class={styles.formDemo}>
      <Form
        model={{
          attributes: [
            {
              id: "display-name",
              label: "Display name",
              initialValue: "",
              placeholder: "Enter a display name",
              validation: notEmpty("Display name is required."),
            },
          ],
        }}
      >
        <BasicFormField fieldName="display-name" />
        <TouchedState fieldName="display-name" />
        <ResetButton />
      </Form>
    </div>
  );
}

function ExplicitSubmitFormDemo() {
  const [submitted, setSubmitted] = createSignal("Not submitted");
  return (
    <div class={styles.formDemo}>
      <Form
        model={{
          attributes: [
            {
              id: "name",
              label: "Name",
              initialValue: "",
              placeholder: "Enter a name",
              validation: notEmpty("Name is required."),
            },
          ],
        }}
        persistence={{
          type: "submit",
          onSubmit: (values) => {
            setSubmitted(JSON.stringify(values));
          },
        }}
      >
        <BasicFormField fieldName="name" />
        <ExplicitSubmitButton />
      </Form>
      <div class={styles.saveStatus}>
        <span>Submitted values</span>
        <output>{submitted()}</output>
      </div>
    </div>
  );
}

function ExplicitSubmitButton() {
  const form = useFormState();
  return (
    <button class={styles.mountButton} type="button" disabled={form.saving()} onClick={() => void form.submit()}>
      Submit
    </button>
  );
}

function ResetButton() {
  const form = useFormState();
  return (
    <button class={styles.mountButton} type="button" onClick={form.reset}>
      Reset form
    </button>
  );
}

function TouchedState(props: { fieldName: string }) {
  const field = useFormField(props.fieldName);
  return (
    <div class={styles.currentValue}>
      <span>Touched</span>
      <output>{String(field.touched())}</output>
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
    {
      name: "Matching fields",
      description: "Form-level validation that associates a mismatch with one field.",
      render: () => <MatchingFieldsFormDemo />,
    },
    {
      name: "Form-level validation",
      description: "Multi-field validation with a message not associated with a specific field.",
      render: () => <FormLevelValidationDemo />,
    },
    {
      name: "Touched validation",
      description: "Validation feedback shown after an invalid field loses focus.",
      render: () => <TouchedFormDemo />,
    },
    {
      name: "Explicit submission",
      description: "A create-style form that validates and submits only when commanded.",
      render: () => <ExplicitSubmitFormDemo />,
    },
  ],
} satisfies ComponentDemo;
