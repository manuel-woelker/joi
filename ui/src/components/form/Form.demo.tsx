import { createUniqueId } from "solid-js";

import type { ComponentDemo } from "../../playground/demo";
import { Form, useFormField } from "./Form";
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

export default {
  name: "Form",
  description: "Form for editing data through context-aware fields.",
  scenarios: [
    {
      name: "Minimal",
      description: "A text field and another consumer sharing the same reactive field value.",
      render: () => (
        <Form model={{ attributes: [{ id: "name", label: "Name", initialValue: "Elliot" }] }}>
          <div class={styles.formDemo}>
            <BasicFormField fieldName="name" />
            <FieldValue fieldName="name" />
          </div>
        </Form>
      ),
    },
  ],
} satisfies ComponentDemo;
