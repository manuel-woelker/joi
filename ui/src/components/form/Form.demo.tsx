import { Show, createSignal, createUniqueId } from "solid-js";

import type { ComponentDemo } from "../../playground/demo";
import { Form, useFormField, useFormState } from "./Form";
import styles from "./Form.demo.module.css";

function BasicFormField(props: { fieldName: string }) {
  const formField = useFormField(props.fieldName);
  const inputId = createUniqueId();
  return (
    <div class={styles.field}>
      <label for={inputId}>{formField.label}</label>
      <input id={inputId} value={formField.value} onInput={formField.onInput} />
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
  return (
    <div class={styles.formDemo}>
      <Show when={mounted()} fallback={<p class={styles.unmounted}>Form unmounted</p>}>
        <Form
          model={{ attributes: [{ id: "name", label: "Name", initialValue: "Elliot" }] }}
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

export default {
  name: "Form",
  description: "Form for editing data through context-aware fields.",
  scenarios: [
    {
      name: "Minimal",
      description: "A shared reactive field saved after 500 milliseconds without input.",
      render: () => <DebouncedFormDemo />,
    },
  ],
} satisfies ComponentDemo;
